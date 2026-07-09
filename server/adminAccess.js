import { getUserByTelegramId } from './repositories/users.js'

// Владелец (OWNER_TELEGRAM_ID) — всегда админ, даже если его пока нет в
// таблице users или is_admin там почему-то не выставлен: это единственная
// подстраховка от блокировки самого себя. Остальные админы — по флагу
// users.is_admin, который выставляет владелец через /api/admins.
export function isOwner(telegramId) {
  const ownerId = process.env.OWNER_TELEGRAM_ID
  return Boolean(ownerId) && String(telegramId) === ownerId
}

export async function isAdmin(telegramId) {
  if (isOwner(telegramId)) return true
  const user = await getUserByTelegramId(Number(telegramId))
  return Boolean(user?.is_admin)
}
