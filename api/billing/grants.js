import { requireAuth } from '../../server/auth.js'
import { isOwner } from '../../server/adminAccess.js'
import { getUserByUsername, listProUsers, setBillingPlan } from '../../server/repositories/users.js'

export default async function handler(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return

  if (!isOwner(auth.telegramId)) {
    res.status(403).json({ error: 'Управлять подписками может только владелец' })
    return
  }

  if (req.method === 'GET') {
    const users = await listProUsers()
    res.status(200).json({ users })
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
      res.status(404).json({ error: 'Пользователь ещё не открывал приложение — выдать подписку нельзя' })
      return
    }

    await setBillingPlan(user.telegram_id, 'pro')
    res.status(200).json({ added: true })
    return
  }

  if (req.method === 'DELETE') {
    const targetTelegramId = req.body?.targetTelegramId
    if (!targetTelegramId) {
      res.status(400).json({ error: 'targetTelegramId обязателен' })
      return
    }

    await setBillingPlan(Number(targetTelegramId), 'free')
    res.status(200).json({ removed: true })
    return
  }

  res.status(405).end()
}
