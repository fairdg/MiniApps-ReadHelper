import { requireAuth } from '../server/auth.js'
import { isAdmin } from '../server/adminAccess.js'
import { getDb } from '../server/db.js'
import { deliverNextChunk } from '../server/delivery.js'
import { extractArticle } from '../server/articleExtractor.js'
import { chunkBook, clampTargetWords } from '../server/chunking.js'
import { normalizeBookText, assertReadableText } from '../server/textClean.js'
import { assertCanAddBook } from '../server/billing.js'
import {
  createBook,
  markBookReady,
  markBookFailed,
  getBookById,
  deleteBook,
  updateTitle,
  listBooksWithProgress,
  countActiveBooksByUser,
} from '../server/repositories/books.js'
import { getUserByTelegramId, upsertUser } from '../server/repositories/users.js'
import { saveChunks, getChunksForBook } from '../server/repositories/chunks.js'
import {
  createDelivery,
  getDeliveryForBook,
  updateDeliveryInterval,
  setDeliveryActive,
  notificationsPerDayFromDelivery,
  claimDelivery,
  releaseDeliveryClaim,
  resetProgress,
} from '../server/repositories/deliveries.js'

function parseBookId(raw) {
  const bookId = Number(raw)
  return Number.isInteger(bookId) && bookId > 0 ? bookId : null
}

async function getOwnedBook(auth, bookId) {
  const user = await getUserByTelegramId(auth.telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    return { user: null, book: null }
  }

  return { user, book }
}

function buildReplaceChunksQueries(sql, bookId, chunks) {
  const queries = [sql`delete from chunks where book_id = ${bookId}`]

  for (let position = 0; position < chunks.length; position++) {
    const { chapter = null, content } = chunks[position]
    queries.push(sql`
      insert into chunks (book_id, position, content, chapter)
      values (${bookId}, ${position}, ${content}, ${chapter})
    `)
  }

  return queries
}

function findEquivalentPosition(oldChunks, oldPosition, newChunks) {
  const readChars = oldChunks
    .slice(0, oldPosition)
    .reduce((sum, chunk) => sum + chunk.content.length, 0)

  let covered = 0
  for (let i = 0; i < newChunks.length; i++) {
    covered += newChunks[i].content.length
    if (covered >= readChars) return i
  }
  return newChunks.length
}

async function handleAddBook(req, res, auth) {
  const { title, text, url, notificationsPerDay, timezone, targetWords } = req.body ?? {}

  if (!text && !url) {
    res.status(400).json({ error: 'Нужен текст или url' })
    return
  }

  let sourceTitle = title
  let sourceText = text

  if (url) {
    try {
      const article = await extractArticle(url)
      sourceText = article.text
      if (!sourceTitle) sourceTitle = article.title
    } catch (err) {
      console.error('Failed to extract article from url', err)
      res.status(400).json({ error: 'Не удалось загрузить статью по ссылке' })
      return
    }
  }

  if (!sourceTitle || !sourceText) {
    res.status(400).json({ error: 'Не удалось определить название или текст' })
    return
  }

  try {
    assertReadableText(sourceText)
  } catch (err) {
    res.status(400).json({ error: err.message })
    return
  }

  const cleanText = normalizeBookText(sourceText)
  const resolvedTargetWords = clampTargetWords(targetWords)
  const user = await upsertUser({ telegramId: auth.telegramId, username: auth.username, timezone })
  const activeBookCount = await countActiveBooksByUser(user.id)

  try {
    assertCanAddBook(user, activeBookCount)
  } catch (err) {
    res.status(402).json({ error: err.message, code: err.code })
    return
  }

  const book = await createBook({
    userId: user.id,
    title: sourceTitle,
    sourceText: cleanText,
    targetWords: resolvedTargetWords,
  })

  try {
    const chunks = await chunkBook(cleanText, { targetWords: resolvedTargetWords })
    await saveChunks(book.id, chunks)
    await markBookReady(book.id)
    const delivery = await createDelivery(book.id, notificationsPerDay, user.timezone)
    res.status(200).json({ book, chunkCount: chunks.length, delivery })
  } catch (err) {
    console.error('Failed to chunk book', err)
    await markBookFailed(book.id)
    res.status(500).json({ error: 'Не удалось обработать книгу' })
  }
}

async function handleListBooks(res, auth) {
  const user = await getUserByTelegramId(auth.telegramId)
  if (!user) {
    res.status(200).json({ books: [] })
    return
  }

  const books = await listBooksWithProgress(user.id)
  res.status(200).json({ books })
}

async function handleBookRoot(req, res, auth, bookId) {
  const { user, book } = await getOwnedBook(auth, bookId)
  if (!user || !book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  if (req.method === 'DELETE') {
    await deleteBook(bookId)
    res.status(200).json({ deleted: true })
    return
  }

  const title = req.body?.title?.trim()
  if (!title) {
    res.status(400).json({ error: 'Название не может быть пустым' })
    return
  }

  await updateTitle(bookId, title)
  res.status(200).json({ title })
}

async function handleChunks(res, auth, bookId) {
  const { book } = await getOwnedBook(auth, bookId)
  if (!book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const [chunks, delivery] = await Promise.all([
    getChunksForBook(bookId),
    getDeliveryForBook(bookId),
  ])

  res.status(200).json({
    book,
    chunks,
    deliveredCount: delivery?.next_chunk_position ?? 0,
    notificationsPerDay: notificationsPerDayFromDelivery(delivery),
    deliveryActive: delivery?.is_active ?? false,
  })
}

async function handleDelivery(req, res, auth, bookId) {
  const { notificationsPerDay, isActive } = req.body ?? {}
  if (notificationsPerDay == null && isActive == null) {
    res.status(400).json({ error: 'id и notificationsPerDay/isActive обязательны' })
    return
  }

  const { user, book } = await getOwnedBook(auth, bookId)
  if (!user || !book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  let updatedPerDay
  if (notificationsPerDay != null) {
    await updateDeliveryInterval(bookId, notificationsPerDay, user.timezone)
    updatedPerDay = notificationsPerDayFromDelivery({ notifications_per_day: notificationsPerDay })
  }

  if (isActive != null) {
    await setDeliveryActive(bookId, Boolean(isActive))
  }

  res.status(200).json({
    ...(updatedPerDay != null && { notificationsPerDay: updatedPerDay }),
    ...(isActive != null && { isActive: Boolean(isActive) }),
  })
}

async function handleChunkSize(req, res, auth, bookId) {
  const { targetWords } = req.body ?? {}
  if (targetWords == null) {
    res.status(400).json({ error: 'id и targetWords обязательны' })
    return
  }

  const { user, book } = await getOwnedBook(auth, bookId)
  if (!user || !book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const resolvedTargetWords = clampTargetWords(targetWords)

  try {
    const [oldChunks, delivery] = await Promise.all([getChunksForBook(bookId), getDeliveryForBook(bookId)])
    const chunks = await chunkBook(book.source_text, { targetWords: resolvedTargetWords })
    const newPosition = delivery
      ? findEquivalentPosition(oldChunks, delivery.next_chunk_position, chunks)
      : null
    const sql = getDb()

    await sql.transaction((tx) => {
      const queries = [
        ...buildReplaceChunksQueries(tx, bookId, chunks),
        tx`
          update books
          set target_words = ${resolvedTargetWords},
              status = 'ready'
          where id = ${bookId}
        `,
      ]

      if (newPosition != null) {
        queries.push(tx`update deliveries set next_chunk_position = ${newPosition} where book_id = ${bookId}`)
      }

      return queries
    })

    res.status(200).json({ targetWords: resolvedTargetWords, chunkCount: chunks.length })
  } catch (err) {
    console.error('Failed to re-chunk book', err)
    await markBookFailed(bookId)
    res.status(500).json({ error: 'Не удалось пересобрать порции' })
  }
}

async function handleDeliverNow(res, auth, bookId) {
  if (!(await isAdmin(auth.telegramId))) {
    res.status(403).json({ error: 'Доступно только в режиме разработчика' })
    return
  }

  const { user, book } = await getOwnedBook(auth, bookId)
  if (!user || !book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const delivery = await getDeliveryForBook(bookId)
  if (!delivery || !delivery.is_active) {
    res.status(400).json({ error: 'Доставка для этой книги не активна' })
    return
  }

  const claimed = await claimDelivery(
    {
      ...delivery,
      telegram_id: user.telegram_id,
      timezone: user.timezone,
    },
    { force: true },
  )

  if (!claimed) {
    res.status(409).json({ error: 'Эта доставка уже обрабатывается другим процессом' })
    return
  }

  try {
    const result = await deliverNextChunk(claimed)
    res.status(200).json(result)
  } catch (err) {
    await releaseDeliveryClaim(claimed).catch((releaseErr) => {
      console.error(`Delivery ${claimed.id} claim release failed:`, releaseErr)
    })
    console.error(`Delivery ${claimed.id} failed:`, err)
    res.status(500).json({ error: 'Не удалось отправить порцию сейчас' })
  }
}

async function handleResetProgress(res, auth, bookId) {
  if (!(await isAdmin(auth.telegramId))) {
    res.status(403).json({ error: 'Доступно только в режиме разработчика' })
    return
  }

  const { user, book } = await getOwnedBook(auth, bookId)
  if (!user || !book) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  await resetProgress(bookId, user.timezone)
  res.status(200).json({ reset: true })
}

export default async function handler(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return

  const action = req.query.action

  if (action === 'add') {
    if (req.method !== 'POST') return res.status(405).end()
    return handleAddBook(req, res, auth)
  }

  if (action === 'list') {
    if (req.method !== 'GET') return res.status(405).end()
    return handleListBooks(res, auth)
  }

  const bookId = parseBookId(req.query.id)
  if (!bookId) {
    res.status(404).json({ error: 'Маршрут не найден' })
    return
  }

  if (action === 'root') {
    if (req.method !== 'DELETE' && req.method !== 'PATCH') return res.status(405).end()
    return handleBookRoot(req, res, auth, bookId)
  }

  if (action === 'chunks') {
    if (req.method !== 'GET') return res.status(405).end()
    return handleChunks(res, auth, bookId)
  }

  if (action === 'delivery') {
    if (req.method !== 'PATCH') return res.status(405).end()
    return handleDelivery(req, res, auth, bookId)
  }

  if (action === 'chunk-size') {
    if (req.method !== 'PATCH') return res.status(405).end()
    return handleChunkSize(req, res, auth, bookId)
  }

  if (action === 'deliver-now') {
    if (req.method !== 'POST') return res.status(405).end()
    return handleDeliverNow(res, auth, bookId)
  }

  if (action === 'reset-progress') {
    if (req.method !== 'POST') return res.status(405).end()
    return handleResetProgress(res, auth, bookId)
  }

  res.status(404).json({ error: 'Маршрут не найден' })
}
