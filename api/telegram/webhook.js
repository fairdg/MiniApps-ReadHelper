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
  'Команды:',
  '/start — открыть приложение',
  '/add — как добавить книгу, текст или статью',
  '/schedule — как работает расписание',
  '/limits — лимиты бесплатного тарифа',
  '/pro — что даёт ReadHelper Pro',
  '/support — поддержка по оплате и сервису',
  '/terms — условия ReadHelper Pro',
  '/privacy — данные и приватность',
].join('\n')

const ADD_TEXT = [
  'Как добавить текст:',
  '1. Открой мини-приложение.',
  '2. Нажми "+".',
  '3. Вставь текст вручную, загрузи .txt/.md файл или вставь ссылку на статью.',
  '',
  'Для ссылок ReadHelper попробует сам вытащить название и основной текст статьи.',
].join('\n')

const SCHEDULE_TEXT = [
  'Как работает расписание:',
  '• у каждой книги можно выбрать 1-14 уведомлений в день,',
  '• доставка не приходит ночью: 23:00-08:00 по твоему времени,',
  '• книгу можно поставить на паузу и потом снова включить,',
  '• размер порции меняется в настройках книги на экране чтения.',
].join('\n')

const LIMITS_TEXT = [
  'Лимиты:',
  '• бесплатный тариф — 1 книга в процессе,',
  '• завершённые книги не мешают читать следующую,',
  '• ReadHelper Pro снимает лимит на количество книг в процессе.',
].join('\n')

const PRO_TEXT = [
  'ReadHelper Pro:',
  '• снимает лимит на количество книг в процессе,',
  '• активируется для текущего Telegram-аккаунта,',
  '• покупается один раз через Telegram Stars.',
  '',
  'Купить Pro можно в мини-приложении: Настройки приложения → карточка тарифа.',
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

const PRIVACY_TEXT = [
  'Данные ReadHelper:',
  '• хранит твой Telegram id, username и книги, которые ты добавляешь,',
  '• использует timezone, чтобы не слать порции ночью,',
  '• платежи обрабатываются через Telegram Stars,',
  '• удалить книгу можно из списка в мини-приложении.',
].join('\n')

function parseCommand(text) {
  if (!text?.startsWith('/')) return null
  return text.trim().split(/\s+/)[0].split('@')[0]
}

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

  const command = parseCommand(message.text)

  if (command === '/start') {
    await sendMessage(
      chatId,
      'Привет! Я помогу тебе читать книги маленькими порциями, чтобы не терять фокус. Открой мини-приложение, чтобы добавить книгу.',
      { reply_markup: openAppKeyboard() },
    )
  } else if (command === '/help') {
    await sendMessage(chatId, HELP_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/add') {
    await sendMessage(chatId, ADD_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/schedule') {
    await sendMessage(chatId, SCHEDULE_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/limits') {
    await sendMessage(chatId, LIMITS_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/pro') {
    await sendMessage(chatId, PRO_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/support') {
    await sendMessage(chatId, SUPPORT_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/terms') {
    await sendMessage(chatId, TERMS_TEXT, { reply_markup: openAppKeyboard() })
  } else if (command === '/privacy') {
    await sendMessage(chatId, PRIVACY_TEXT, { reply_markup: openAppKeyboard() })
  }

  res.status(200).end()
}
