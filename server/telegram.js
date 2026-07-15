const API_BASE = 'https://api.telegram.org'

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return token
}

async function callTelegram(method, body) {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${await res.text()}`)
  }

  const payload = await res.json()
  if (!payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description || 'Unknown error'}`)
  }
  return payload.result
}

export async function sendMessage(chatId, text, options = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, ...options })
}

export async function answerPreCheckoutQuery(preCheckoutQueryId, ok, errorMessage) {
  return callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage }),
  })
}

export async function createInvoiceLink(payload) {
  return callTelegram('createInvoiceLink', payload)
}
