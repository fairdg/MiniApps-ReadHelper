const DEV_ID_KEY = 'readhelper_dev_telegram_id'

// Вне Telegram (обычный браузер при локальной разработке) initDataUnsafe.user
// пустой — эмулируем стабильного локального пользователя через localStorage.
function getDevUser() {
  let id = localStorage.getItem(DEV_ID_KEY)
  if (!id) {
    id = String(-Math.floor(Math.random() * 1_000_000_000) - 1)
    localStorage.setItem(DEV_ID_KEY, id)
  }
  return { telegramId: Number(id), username: 'dev_user' }
}

// IANA-таймзона браузера/устройства — используется бэкендом, чтобы не
// присылать уведомления ночью по местному времени пользователя.
function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

function telegramWebApp() {
  return window.Telegram?.WebApp
}

export function getTelegramUser() {
  const user = telegramWebApp()?.initDataUnsafe?.user
  const base = user?.id
    ? { telegramId: user.id, username: user.username ?? null }
    : getDevUser()

  return { ...base, timezone: getTimezone() }
}

export function getAuthHeaders() {
  const initData = telegramWebApp()?.initData
  if (initData) {
    return { 'X-Telegram-Init-Data': initData }
  }

  const { telegramId, username } = getTelegramUser()
  const encoded = btoa(
    JSON.stringify({
      telegramId,
      username,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return { 'X-ReadHelper-Dev-Auth': encoded }
}
