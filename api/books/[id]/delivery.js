import { getUserByTelegramId } from '../../../lib/repositories/users.js'
import { getBookById } from '../../../lib/repositories/books.js'
import {
  updateDeliveryInterval,
  intervalMinutesFromPerDay,
  perDayFromIntervalMinutes,
} from '../../../lib/repositories/deliveries.js'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const { telegramId, notificationsPerDay } = req.body ?? {}

  if (!bookId || !telegramId || !notificationsPerDay) {
    res.status(400).json({ error: 'id, telegramId и notificationsPerDay обязательны' })
    return
  }

  const user = await getUserByTelegramId(Number(telegramId))
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  const intervalMinutes = intervalMinutesFromPerDay(notificationsPerDay)
  await updateDeliveryInterval(bookId, intervalMinutes)

  res.status(200).json({ notificationsPerDay: perDayFromIntervalMinutes(intervalMinutes) })
}
