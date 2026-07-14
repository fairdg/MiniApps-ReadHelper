import { getChunk, countChunks } from './repositories/chunks.js'
import { advanceDelivery, deactivateDelivery } from './repositories/deliveries.js'
import { getBookById } from './repositories/books.js'
import { sendMessage } from './telegram.js'

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Пользователь может читать несколько книг одновременно — без подписи
// сообщения от разных книг неотличимы в чате. Жирным — название и прогресс
// (порция N из total), сам текст экранируем отдельно: он произвольный текст
// книги, а не разметка, и не должен случайно сломать HTML-парсинг Telegram.
function buildMessage(bookTitle, position, total, content) {
  const header = `<b>${escapeHtml(bookTitle)}</b> · ${position}/${total}`
  return `${header}\n\n${escapeHtml(content)}`
}

// Отправляет следующую порцию по конкретной доставке и продвигает
// расписание. Общая логика для крона и ручного "отправить сейчас" в
// режиме разработчика — обе точки входа должны вести себя одинаково.
export async function deliverNextChunk(delivery) {
  const chunk = await getChunk(delivery.book_id, delivery.next_chunk_position)

  if (!chunk) {
    await deactivateDelivery(delivery.id)
    return { sent: false }
  }

  const total = await countChunks(delivery.book_id)
  const book = await getBookById(delivery.book_id)
  const message = buildMessage(book.title, delivery.next_chunk_position + 1, total, chunk.content)
  await sendMessage(delivery.telegram_id, message, { parse_mode: 'HTML' })

  const nextPosition = delivery.next_chunk_position + 1

  if (nextPosition >= total) {
    await deactivateDelivery(delivery.id, nextPosition)
  } else {
    await advanceDelivery(delivery, nextPosition)
  }

  return { sent: true }
}
