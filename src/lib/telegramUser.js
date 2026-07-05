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

export function getTelegramUser() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (user?.id) {
    return { telegramId: user.id, username: user.username ?? null }
  }
  return getDevUser()
}
