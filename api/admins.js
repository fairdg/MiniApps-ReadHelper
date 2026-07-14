import { getUserByUsername, setAdmin, listAdmins } from '../server/repositories/users.js'
import { isOwner, isAdmin } from '../server/adminAccess.js'
import { requireAuth } from '../server/auth.js'

// Управление списком админов — доступно только владельцу (OWNER_TELEGRAM_ID).
// GET — тоже используется как обычная проверка "админ ли я" для UI (devMode.js):
// список админов внутри отдаёт только владельцу, остальным — только isAdmin.
export default async function handler(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return

  if (req.method === 'GET') {
    const admin = await isAdmin(auth.telegramId)
    const admins = isOwner(auth.telegramId) ? await listAdmins() : []
    res.status(200).json({ isAdmin: admin, isOwner: isOwner(auth.telegramId), admins })
    return
  }

  if (!isOwner(auth.telegramId)) {
    res.status(403).json({ error: 'Управлять админами может только владелец' })
    return
  }

  if (req.method === 'POST') {
    const username = req.body?.username?.trim()
    if (!username) {
      res.status(400).json({ error: 'Укажи username' })
      return
    }

    const user = await getUserByUsername(username)
    if (!user) {
      res.status(404).json({ error: 'Пользователь ещё не открывал приложение — добавить его нельзя' })
      return
    }

    await setAdmin(user.telegram_id, true)
    res.status(200).json({ added: true })
    return
  }

  if (req.method === 'DELETE') {
    const targetTelegramId = req.body?.targetTelegramId
    if (!targetTelegramId) {
      res.status(400).json({ error: 'targetTelegramId обязателен' })
      return
    }

    await setAdmin(Number(targetTelegramId), false)
    res.status(200).json({ removed: true })
    return
  }

  res.status(405).end()
}
