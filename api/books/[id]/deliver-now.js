import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById } from '../../../server/repositories/books.js'
import { getDeliveryForBook } from '../../../server/repositories/deliveries.js'
import { deliverNextChunk } from '../../../server/delivery.js'

// Ручной триггер для режима разработчика: отправляет следующую порцию
// прямо сейчас, в обход расписания — чтобы не ждать реальный интервал
// доставки при проверке функциональности. Доступен только владельцу
// (OWNER_TELEGRAM_ID) — обычные пользователи не должны иметь возможность
// обойти расписание, даже если найдут кнопку в devtools.
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

  const ownerId = process.env.OWNER_TELEGRAM_ID
  if (ownerId && String(telegramId) !== ownerId) {
    res.status(403).json({ error: 'Доступно только в режиме разработчика владельца' })
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

  const result = await deliverNextChunk({
    ...delivery,
    telegram_id: user.telegram_id,
    timezone: user.timezone,
  })
  res.status(200).json(result)
}
