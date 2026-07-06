import { getUserByTelegramId } from '../../../lib/repositories/users.js'
import { getBookById } from '../../../lib/repositories/books.js'
import {
  updateDeliveryInterval,
  setDeliveryActive,
  intervalMinutesFromPerDay,
  perDayFromIntervalMinutes,
} from '../../../lib/repositories/deliveries.js'

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

  let intervalMinutes
  if (notificationsPerDay != null) {
    intervalMinutes = intervalMinutesFromPerDay(notificationsPerDay)
    await updateDeliveryInterval(bookId, intervalMinutes, user.timezone)
  }

  if (isActive != null) {
    await setDeliveryActive(bookId, Boolean(isActive))
  }

  res.status(200).json({
    ...(intervalMinutes != null && { notificationsPerDay: perDayFromIntervalMinutes(intervalMinutes) }),
    ...(isActive != null && { isActive: Boolean(isActive) }),
  })
}
