import { upsertUser } from '../../lib/repositories/users.js'
import { sendMessage } from '../../lib/telegram.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret && req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
    res.status(401).end()
    return
  }

  const message = req.body?.message
  if (!message?.from) {
    res.status(200).end()
    return
  }

  const chatId = message.chat.id
  await upsertUser({ telegramId: message.from.id, username: message.from.username ?? null })

  if (message.text === '/start') {
    await sendMessage(
      chatId,
      'Привет! Я помогу тебе читать книги маленькими порциями, чтобы не терять фокус. Открой мини-приложение, чтобы добавить книгу.',
    )
  }

  res.status(200).end()
}
