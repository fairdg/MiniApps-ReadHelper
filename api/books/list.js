import { getUserByTelegramId } from '../../server/repositories/users.js'
import { listBooksWithProgress } from '../../server/repositories/books.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }

  const telegramId = Number(req.query.telegramId)
  if (!telegramId) {
    res.status(400).json({ error: 'telegramId обязателен' })
    return
  }

  const user = await getUserByTelegramId(telegramId)
  if (!user) {
    res.status(200).json({ books: [] })
    return
  }

  const books = await listBooksWithProgress(user.id)
  res.status(200).json({ books })
}
