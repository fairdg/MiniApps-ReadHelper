import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById, updateTargetWords, markBookReady, markBookFailed } from '../../../server/repositories/books.js'
import { saveChunks, deleteChunksForBook, getChunksForBook } from '../../../server/repositories/chunks.js'
import { getDeliveryForBook, setDeliveryPosition } from '../../../server/repositories/deliveries.js'
import { chunkBook, clampTargetWords } from '../../../server/chunking.js'
import { requireAuth } from '../../../server/auth.js'

// Находит позицию в новых чанках, примерно соответствующую тому же месту в
// книге, где читатель остановился по старым чанкам — иначе смена размера
// порции откатывала бы прогресс на начало книги при каждой правке настройки.
// Точного соответствия границ не бывает (порции режутся по-разному), поэтому
// ищем ближайший по объёму уже пройденного текста (в символах).
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

// Меняет ориентир размера порции для уже добавленной книги и пересобирает
// все чанки из уже нормализованного source_text — дробление зависит от
// targetWords, поэтому старые чанки просто не подходят под новый размер.
// Курсор прогресса переставляется на примерно то же место в книге (см.
// findEquivalentPosition), расписание/пауза/активность доставки не трогаются.
export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

  const bookId = Number(req.query.id)
  const { targetWords } = req.body ?? {}

  if (!bookId || targetWords == null) {
    res.status(400).json({ error: 'id и targetWords обязательны' })
    return
  }

  const user = await getUserByTelegramId(auth.telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const resolvedTargetWords = clampTargetWords(targetWords)

  try {
    const [oldChunks, delivery] = await Promise.all([getChunksForBook(bookId), getDeliveryForBook(bookId)])
    const chunks = await chunkBook(book.source_text, { targetWords: resolvedTargetWords })

    await deleteChunksForBook(bookId)
    await saveChunks(bookId, chunks)
    await updateTargetWords(bookId, resolvedTargetWords)
    await markBookReady(bookId)

    if (delivery) {
      const newPosition = findEquivalentPosition(oldChunks, delivery.next_chunk_position, chunks)
      await setDeliveryPosition(bookId, newPosition)
    }

    res.status(200).json({ targetWords: resolvedTargetWords, chunkCount: chunks.length })
  } catch (err) {
    console.error('Failed to re-chunk book', err)
    await markBookFailed(bookId)
    res.status(500).json({ error: 'Не удалось пересобрать порции' })
  }
}
