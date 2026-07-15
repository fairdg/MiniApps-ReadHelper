const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN обязателен (запускай через npm run set-commands)')
  process.exit(1)
}

const commands = [
  { command: 'start', description: 'Открыть ReadHelper' },
  { command: 'help', description: 'Как пользоваться ботом' },
  { command: 'add', description: 'Как добавить книгу, текст или статью' },
  { command: 'schedule', description: 'Как работает расписание порций' },
  { command: 'limits', description: 'Лимиты бесплатного тарифа' },
  { command: 'pro', description: 'Что даёт ReadHelper Pro' },
  { command: 'support', description: 'Поддержка по оплате и сервису' },
  { command: 'terms', description: 'Условия ReadHelper Pro' },
  { command: 'privacy', description: 'Какие данные использует ReadHelper' },
]

const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ commands }),
})

console.log(await res.json())
