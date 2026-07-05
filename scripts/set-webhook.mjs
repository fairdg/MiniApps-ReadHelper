const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEBAPP_URL
const secret = process.env.TELEGRAM_WEBHOOK_SECRET

if (!token || !webAppUrl) {
  console.error('TELEGRAM_BOT_TOKEN и WEBAPP_URL обязательны (запускай через npm run set-webhook)')
  process.exit(1)
}

const webhookUrl = `${webAppUrl.replace(/\/$/, '')}/api/telegram/webhook`

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
})

console.log(await res.json())
