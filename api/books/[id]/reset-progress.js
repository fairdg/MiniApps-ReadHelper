import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById } from '../../../server/repositories/books.js'
import { resetProgress } from '../../../server/repositories/deliveries.js'
import { isAdmin } from '../../../server/adminAccess.js'
import { requireAuth } from '../../../server/auth.js'

// Перечитать книгу с начала — режим разработчика. Доступен владельцу и
// назначенным им админам, как и deliver-now.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

  if (!(await isAdmin(auth.telegramId))) {
    res.status(403).json({ error: 'Доступно только в режиме разработчика' })
    return
  }

  const user = await getUserByTelegramId(auth.telegramId)
  const book = await getBookById(bookId)

  if (!user || !book || String(book.user_id) !== String(user.id)) {
    res.status(404).json({ error: 'Книга не найдена' })
    return
  }

  await resetProgress(bookId, user.timezone)
  res.status(200).json({ reset: true })
}
