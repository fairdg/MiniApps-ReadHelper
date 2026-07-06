import { upsertUser } from '../../lib/repositories/users.js'
import { createBook, markBookReady, markBookFailed } from '../../lib/repositories/books.js'
import { saveChunks } from '../../lib/repositories/chunks.js'
import { createDelivery, intervalMinutesFromPerDay } from '../../lib/repositories/deliveries.js'
import { chunkBook } from '../../lib/chunking.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const { telegramId, username, title, text, notificationsPerDay } = req.body ?? {}

  if (!telegramId || !title || !text) {
    res.status(400).json({ error: 'telegramId, title и text обязательны' })
    return
  }

  const user = await upsertUser({ telegramId, username })
  const book = await createBook({ userId: user.id, title, sourceText: text })

  try {
    const chunks = await chunkBook(text)
    await saveChunks(book.id, chunks)
    await markBookReady(book.id)
    const delivery = await createDelivery(book.id, intervalMinutesFromPerDay(notificationsPerDay))
    res.status(200).json({ book, chunkCount: chunks.length, delivery })
  } catch (err) {
    console.error('Failed to chunk book', err)
    await markBookFailed(book.id)
    res.status(500).json({ error: 'Не удалось обработать книгу' })
  }
}
