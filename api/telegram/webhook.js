import { upsertUser } from '../../lib/repositories/users.js'
import { sendMessage } from '../../lib/telegram.js'

function openAppKeyboard() {
  const webAppUrl = process.env.WEBAPP_URL
  if (!webAppUrl) return undefined

  return {
    inline_keyboard: [[{ text: 'Открыть ReadHelper', web_app: { url: webAppUrl } }]],
  }
}

const HELP_TEXT = [
  'ReadHelper дробит книгу или статью на небольшие порции и присылает их сюда по расписанию — чтобы читать понемногу, не теряя фокус.',
  '',
  'Как пользоваться:',
  '1. Открой мини-приложение (кнопка ниже или через меню чата) и добавь текст.',
  '2. Выбери, сколько уведомлений в день хочешь получать.',
  '3. Порции будут приходить сюда по расписанию — просто читай, когда придёт сообщение.',
  '',
  'Команды: /start — открыть приложение, /help — это сообщение.',
].join('\n')

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
      { reply_markup: openAppKeyboard() },
    )
  } else if (message.text === '/help') {
    await sendMessage(chatId, HELP_TEXT, { reply_markup: openAppKeyboard() })
  }

  res.status(200).end()
}
