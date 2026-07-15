import { upsertUser } from '../../server/repositories/users.js'
import { createPayment } from '../../server/repositories/payments.js'
import { activateProPlan } from '../../server/repositories/users.js'
import { answerPreCheckoutQuery, sendMessage } from '../../server/telegram.js'
import { parseInvoicePayload, validatePreCheckout } from '../../server/billing.js'

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
  'Тарифы:',
  '• бесплатно — 1 книга в процессе,',
  '• ReadHelper Pro — снимает лимит на количество книг в процессе.',
  '',
  'Как добавить текст (в мини-приложении, кнопка "+"):',
  '• вставить текст вручную,',
  '• загрузить .txt/.md файл,',
  '• или просто вставить ссылку на статью — текст подтянется автоматически.',
  '',
  'Что можно настроить у каждой книги (шестерёнка на экране чтения):',
  '• сколько уведомлений в день присылать (1-14),',
  '• поставить доставку на паузу и снять с неё,',
  '• размер шрифта.',
  '',
  'Порции не приходят ночью (23:00-08:00 по твоему времени) — доставка сама сдвигается на утро.',
  'Ненужную книгу можно удалить из списка (иконка корзины).',
  '',
  'Команды: /start — открыть приложение, /help — это сообщение, /support — поддержка, /terms — условия.',
].join('\n')

const TERMS_TEXT = [
  'Условия ReadHelper Pro:',
  '• покупка единоразовая и активирует Pro для текущего Telegram-аккаунта,',
  '• Pro снимает лимит на количество книг в процессе,',
  '• доступ к книгам и доставке остаётся в рамках текущего бота и мини-приложения,',
  '• по вопросам оплаты и работы сервиса используй /support или кнопку отзыва в настройках приложения.',
].join('\n')

const SUPPORT_TEXT =
  'Поддержка ReadHelper: открой мини-приложение → Настройки → Оставить отзыв. Если покупка прошла, но Pro не активировался, напиши с этого же Telegram-аккаунта и приложи скрин квитанции.'

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

  const preCheckoutQuery = req.body?.pre_checkout_query
  if (preCheckoutQuery) {
    const validation = validatePreCheckout(preCheckoutQuery)
    await answerPreCheckoutQuery(preCheckoutQuery.id, validation.ok, validation.error)
    res.status(200).end()
    return
  }

  const message = req.body?.message
  if (!message?.from) {
    res.status(200).end()
    return
  }

  const chatId = message.chat.id
  const user = await upsertUser({ telegramId: message.from.id, username: message.from.username ?? null })

  if (message.successful_payment) {
    const payment = message.successful_payment
    const parsed = parseInvoicePayload(payment.invoice_payload)
    if (parsed?.kind === 'pro_upgrade' && parsed.telegramId === message.from.id) {
      const created = await createPayment({
        userId: user.id,
        kind: parsed.kind,
        currency: payment.currency,
        totalAmount: payment.total_amount,
        invoicePayload: payment.invoice_payload,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id ?? null,
        rawPayment: payment,
      })

      if (created) {
        await activateProPlan(message.from.id)
        await sendMessage(
          chatId,
          'Оплата прошла. ReadHelper Pro активирован: теперь можно держать сколько угодно книг в процессе.',
        )
      }
    }

    res.status(200).end()
    return
  }

  if (message.text === '/start') {
    await sendMessage(
      chatId,
      'Привет! Я помогу тебе читать книги маленькими порциями, чтобы не терять фокус. Открой мини-приложение, чтобы добавить книгу.',
      { reply_markup: openAppKeyboard() },
    )
  } else if (message.text === '/help') {
    await sendMessage(chatId, HELP_TEXT, { reply_markup: openAppKeyboard() })
  } else if (message.text === '/support') {
    await sendMessage(chatId, SUPPORT_TEXT, { reply_markup: openAppKeyboard() })
  } else if (message.text === '/terms') {
    await sendMessage(chatId, TERMS_TEXT, { reply_markup: openAppKeyboard() })
  }

  res.status(200).end()
}
