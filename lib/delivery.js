import { getChunk, countChunks } from './repositories/chunks.js'
import { advanceDelivery, deactivateDelivery } from './repositories/deliveries.js'
import { sendMessage } from './telegram.js'

// Отправляет следующую порцию по конкретной доставке и продвигает
// расписание. Общая логика для крона и ручного "отправить сейчас" в
// режиме разработчика — обе точки входа должны вести себя одинаково.
export async function deliverNextChunk(delivery) {
  const chunk = await getChunk(delivery.book_id, delivery.next_chunk_position)

  if (!chunk) {
    await deactivateDelivery(delivery.id)
    return { sent: false }
  }

  await sendMessage(delivery.telegram_id, chunk.content)

  const total = await countChunks(delivery.book_id)
  const nextPosition = delivery.next_chunk_position + 1

  if (nextPosition >= total) {
    await deactivateDelivery(delivery.id)
  } else {
    await advanceDelivery(delivery.id, nextPosition, delivery.interval_minutes, delivery.timezone)
  }

  return { sent: true }
}
