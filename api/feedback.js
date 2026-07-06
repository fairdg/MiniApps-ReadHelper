import { upsertUser } from '../server/repositories/users.js'
import { createFeedback } from '../server/repositories/feedback.js'
import { sendMessage } from '../server/telegram.js'

// #отзыв — хэштег в начале сообщения, чтобы владелец мог найти все отзывы
// поиском прямо внутри чата с ботом (Telegram делает хэштеги кликабельными).
function buildOwnerNotification({ username, telegramId, message }) {
  const who = username ? `@${username}` : `id ${telegramId}`
  return `#отзыв\nОт: ${who}\n\n${message}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const { telegramId, username, message } = req.body ?? {}

  if (!telegramId || !message?.trim()) {
    res.status(400).json({ error: 'telegramId и message обязательны' })
    return
  }

  const user = await upsertUser({ telegramId, username })
  const feedback = await createFeedback({ userId: user.id, message: message.trim() })

  const ownerId = process.env.OWNER_TELEGRAM_ID
  if (ownerId) {
    try {
      await sendMessage(ownerId, buildOwnerNotification({ username, telegramId, message: message.trim() }))
    } catch (err) {
      // Отзыв уже сохранён в БД — не роняем запрос, если не удалось уведомить.
      console.error('Failed to notify owner about feedback:', err)
    }
  }

  res.status(200).json({ id: feedback.id })
}
