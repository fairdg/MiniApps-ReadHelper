import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById } from '../../../server/repositories/books.js'
import {
  updateDeliveryInterval,
  setDeliveryActive,
  notificationsPerDayFromDelivery,
} from '../../../server/repositories/deliveries.js'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const { telegramId, notificationsPerDay, isActive } = req.body ?? {}

  if (!bookId || !telegramId || (notificationsPerDay == null && isActive == null)) {
    res.status(400).json({ error: 'id, telegramId и notificationsPerDay/isActive обязательны' })
    return
  }

  const user = await getUserByTelegramId(Number(telegramId))
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
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
