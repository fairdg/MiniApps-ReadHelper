import { getUserByTelegramId } from '../../server/repositories/users.js'
import { listBooksWithProgress } from '../../server/repositories/books.js'
import { requireAuth } from '../../server/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

  const user = await getUserByTelegramId(auth.telegramId)
  if (!user) {
    res.status(200).json({ books: [] })
    return
  }

  const books = await listBooksWithProgress(user.id)
  res.status(200).json({ books })
}
