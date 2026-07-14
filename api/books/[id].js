import { getUserByTelegramId } from '../../server/repositories/users.js'
import { getBookById, deleteBook, updateTitle } from '../../server/repositories/books.js'
import { requireAuth } from '../../server/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

  const bookId = Number(req.query.id)
  if (!bookId) {
    res.status(400).json({ error: 'id обязателен' })
    return
  }

  const user = await getUserByTelegramId(auth.telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  if (req.method === 'DELETE') {
    await deleteBook(bookId)
    res.status(200).json({ deleted: true })
    return
  }

  const title = req.body?.title?.trim()
  if (!title) {
    res.status(400).json({ error: 'Название не может быть пустым' })
    return
  }

  await updateTitle(bookId, title)
  res.status(200).json({ title })
}
