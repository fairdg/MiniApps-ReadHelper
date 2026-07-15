import { upsertUser } from '../../server/repositories/users.js'
import { createBook, markBookReady, markBookFailed } from '../../server/repositories/books.js'
import { saveChunks } from '../../server/repositories/chunks.js'
import { createDelivery } from '../../server/repositories/deliveries.js'
import { chunkBook, clampTargetWords } from '../../server/chunking.js'
import { normalizeBookText, assertReadableText } from '../../server/textClean.js'
import { extractArticle } from '../../server/articleExtractor.js'
import { requireAuth } from '../../server/auth.js'
import { assertCanAddBook } from '../../server/billing.js'
import { countActiveBooksByUser } from '../../server/repositories/books.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

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
