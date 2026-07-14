import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById } from '../../../server/repositories/books.js'
import { getChunksForBook } from '../../../server/repositories/chunks.js'
import {
  getDeliveryForBook,
  notificationsPerDayFromDelivery,
} from '../../../server/repositories/deliveries.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const telegramId = Number(req.query.telegramId)

  if (!bookId || !telegramId) {
    res.status(400).json({ error: 'id и telegramId обязательны' })
    return
  }

  const user = await getUserByTelegramId(telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
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
