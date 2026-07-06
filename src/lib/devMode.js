const KEY = 'readhelper_dev_mode'

export function isDevMode() {
  return localStorage.getItem(KEY) === '1'
}

export function setDevMode(value) {
  localStorage.setItem(KEY, value ? '1' : '0')
}

// Режим разработчика — только для владельца проекта, обычные пользователи
// не должны видеть эту настройку вообще. Реальная защита — на бэкенде
// (deliver-now проверяет тот же ID), это лишь скрывает UI от посторонних.
export function isOwner(telegramId) {
  const ownerId = import.meta.env.VITE_OWNER_TELEGRAM_ID
  return Boolean(ownerId) && String(telegramId) === String(ownerId)
}
