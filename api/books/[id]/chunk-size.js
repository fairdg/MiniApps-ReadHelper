import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById, updateTargetWords, markBookReady, markBookFailed } from '../../../server/repositories/books.js'
import { saveChunks, deleteChunksForBook } from '../../../server/repositories/chunks.js'
import { resetDeliveryProgress } from '../../../server/repositories/deliveries.js'
import { chunkBook, clampTargetWords } from '../../../server/chunking.js'

// Меняет ориентир размера порции для уже добавленной книги и пересобирает
// все чанки из уже нормализованного source_text — дробление зависит от
// targetWords, поэтому старые чанки просто не подходят под новый размер.
// Побочный эффект, явно показанный пользователю на фронте: прогресс чтения
// (next_chunk_position) сбрасывается на начало — старые позиции ничего не
// значат при новых границах порций.
export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const { telegramId, targetWords } = req.body ?? {}

  if (!bookId || !telegramId || targetWords == null) {
    res.status(400).json({ error: 'id, telegramId и targetWords обязательны' })
    return
  }

  const user = await getUserByTelegramId(Number(telegramId))
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const resolvedTargetWords = clampTargetWords(targetWords)

  try {
    const chunks = await chunkBook(book.source_text, { targetWords: resolvedTargetWords })
    await deleteChunksForBook(bookId)
    await saveChunks(bookId, chunks)
    await updateTargetWords(bookId, resolvedTargetWords)
    await markBookReady(bookId)
    await resetDeliveryProgress(bookId)
    res.status(200).json({ targetWords: resolvedTargetWords, chunkCount: chunks.length })
  } catch (err) {
    console.error('Failed to re-chunk book', err)
    await markBookFailed(bookId)
    res.status(500).json({ error: 'Не удалось пересобрать порции' })
  }
}
