import { getUserByTelegramId } from '../../server/repositories/users.js'
import { getBookById, deleteBook } from '../../server/repositories/books.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.status(405).end()
    return
  }

  const bookId = Number(req.query.id)
  const telegramId = Number(req.query.telegramId)

  if (!bookId || !telegramId) {
    res.status(400).json({ error: 'id и telegramId обязательны' })
    return
  }

  const user = await getUserByTelegramId(telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  await deleteBook(bookId)
  res.status(200).json({ deleted: true })
}
