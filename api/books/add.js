import { upsertUser } from '../../lib/repositories/users.js'
import { createBook, markBookReady, markBookFailed } from '../../lib/repositories/books.js'
import { saveChunks } from '../../lib/repositories/chunks.js'
import { createDelivery, intervalMinutesFromPerDay } from '../../lib/repositories/deliveries.js'
import { chunkBook } from '../../lib/chunking.js'
import { stripImages } from '../../lib/textClean.js'
import { extractArticle } from '../../lib/articleExtractor.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const { telegramId, username, title, text, url, notificationsPerDay, timezone } = req.body ?? {}

  if (!telegramId || (!text && !url)) {
    res.status(400).json({ error: 'telegramId и (text или url) обязательны' })
    return
  }

  let sourceTitle = title
  let sourceText = text

  if (url) {
    try {
      const article = await extractArticle(url)
      sourceText = article.text
      if (!sourceTitle) sourceTitle = article.title
    } catch (err) {
      console.error('Failed to extract article from url', err)
      res.status(400).json({ error: 'Не удалось загрузить статью по ссылке' })
      return
    }
  }

  if (!sourceTitle || !sourceText) {
    res.status(400).json({ error: 'Не удалось определить название или текст' })
    return
  }

  const cleanText = stripImages(sourceText)

  const user = await upsertUser({ telegramId, username, timezone })
  const book = await createBook({ userId: user.id, title: sourceTitle, sourceText: cleanText })

  try {
    const chunks = await chunkBook(cleanText)
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
