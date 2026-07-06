import { getUserByTelegramId } from '../../../lib/repositories/users.js'
import { getBookById } from '../../../lib/repositories/books.js'
import { getDeliveryForBook } from '../../../lib/repositories/deliveries.js'
import { deliverNextChunk } from '../../../lib/delivery.js'

// Ручной триггер для режима разработчика: отправляет следующую порцию
// прямо сейчас, в обход расписания — чтобы не ждать реальный интервал
// доставки при проверке функциональности.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const { telegramId } = req.body ?? {}

  if (!bookId || !telegramId) {
    res.status(400).json({ error: 'id и telegramId обязательны' })
    return
  }

  const user = await getUserByTelegramId(Number(telegramId))
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const delivery = await getDeliveryForBook(bookId)

  if (!delivery || !delivery.is_active) {
    res.status(400).json({ error: 'Доставка для этой книги не активна' })
    return
  }

  const result = await deliverNextChunk({ ...delivery, telegram_id: user.telegram_id })
  res.status(200).json(result)
}
