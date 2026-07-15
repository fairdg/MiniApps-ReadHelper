import { requireAuth } from '../../server/auth.js'
import { getBillingSnapshot } from '../../server/billing.js'
import { getUserByTelegramId, upsertUser } from '../../server/repositories/users.js'
import { countActiveBooksByUser } from '../../server/repositories/books.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

  let user = await getUserByTelegramId(auth.telegramId)
  if (!user) {
    user = await upsertUser({ telegramId: auth.telegramId, username: auth.username })
  }

  const activeBookCount = await countActiveBooksByUser(user.id)
  res.status(200).json(getBillingSnapshot(user, activeBookCount))
}
