const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN обязателен (запускай через npm run set-commands)')
  process.exit(1)
}

const commands = [
  { command: 'start', description: 'Открыть ReadHelper' },
  { command: 'help', description: 'Как пользоваться ботом' },
  { command: 'support', description: 'Поддержка по оплате и сервису' },
  { command: 'terms', description: 'Условия ReadHelper Pro' },
]

const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ commands }),
})

console.log(await res.json())
