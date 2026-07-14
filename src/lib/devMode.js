import { getAuthHeaders } from './telegramUser.js'

const KEY = 'readhelper_dev_mode'

export function isDevMode() {
  return localStorage.getItem(KEY) === '1'
}

export function setDevMode(value) {
  localStorage.setItem(KEY, value ? '1' : '0')
}

// Режим разработчика — только для владельца и назначенных им админов,
// обычные пользователи не должны видеть эту настройку вообще. Реальная
// защита — на бэкенде (deliver-now.js проверяет то же самое через
// server/adminAccess.js), это лишь скрывает UI от посторонних.
//
// Мгновенная проверка по env — не ждёт сеть, но знает только про владельца
// (админы есть только в БД). Используется, пока не пришёл ответ checkAdmin().
export function isOwner(telegramId) {
  const ownerId = import.meta.env.VITE_OWNER_TELEGRAM_ID
  return Boolean(ownerId) && String(telegramId) === String(ownerId)
}

// Полная проверка (владелец ИЛИ админ из БД) — асинхронная, дергает бэкенд.
// Заодно отдаёт список админов, если спрашивающий — сам владелец (иначе
// пустой массив), чтобы не делать отдельный запрос для UI управления ими.
export async function checkAdmin() {
  const res = await fetch('/api/admins', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) return { isAdmin: false, isOwner: false, admins: [] }
  return res.json()
}
