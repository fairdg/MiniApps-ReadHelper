import { getUserByTelegramId } from '../../../server/repositories/users.js'
import { getBookById } from '../../../server/repositories/books.js'
import { getDeliveryForBook, claimDelivery, releaseDeliveryClaim } from '../../../server/repositories/deliveries.js'
import { deliverNextChunk } from '../../../server/delivery.js'
import { isAdmin } from '../../../server/adminAccess.js'
import { requireAuth } from '../../../server/auth.js'

// Ручной триггер для режима разработчика: отправляет следующую порцию
// прямо сейчас, в обход расписания — чтобы не ждать реальный интервал
// доставки при проверке функциональности. Доступен владельцу и админам,
// которых он назначил (/api/admins) — обычные пользователи не должны иметь
// возможность обойти расписание, даже если найдут кнопку в devtools.
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

  const delivery = await getDeliveryForBook(bookId)

  if (!delivery || !delivery.is_active) {
    res.status(400).json({ error: 'Доставка для этой книги не активна' })
    return
  }

  const claimed = await claimDelivery(
    {
      ...delivery,
      telegram_id: user.telegram_id,
      timezone: user.timezone,
    },
    { force: true },
  )

  if (!claimed) {
    res.status(409).json({ error: 'Эта доставка уже обрабатывается другим процессом' })
    return
  }

  try {
    const result = await deliverNextChunk(claimed)
    res.status(200).json(result)
  } catch (err) {
    await releaseDeliveryClaim(claimed).catch((releaseErr) => {
      console.error(`Delivery ${claimed.id} claim release failed:`, releaseErr)
    })
    console.error(`Delivery ${claimed.id} failed:`, err)
    res.status(500).json({ error: 'Не удалось отправить порцию сейчас' })
  }
}
