import {
  getDueDeliveries,
  advanceDelivery,
  deactivateDelivery,
} from '../../lib/repositories/deliveries.js'
import { getChunk, countChunks } from '../../lib/repositories/chunks.js'
import { sendMessage } from '../../lib/telegram.js'

export default async function handler(req, res) {
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && req.headers.authorization !== `Bearer ${expectedSecret}`) {
    res.status(401).end()
    return
  }

  const due = await getDueDeliveries()
  let sent = 0
  let failed = 0

  for (const delivery of due) {
    try {
      const chunk = await getChunk(delivery.book_id, delivery.next_chunk_position)

      if (!chunk) {
        await deactivateDelivery(delivery.id)
        continue
      }

      await sendMessage(delivery.telegram_id, chunk.content)

      const total = await countChunks(delivery.book_id)
      const nextPosition = delivery.next_chunk_position + 1

      if (nextPosition >= total) {
        await deactivateDelivery(delivery.id)
      } else {
        await advanceDelivery(delivery.id, nextPosition, delivery.interval_minutes)
      }

      sent++
    } catch (err) {
      // Одна сломанная доставка (например, невалидный chat_id) не должна
      // останавливать рассылку остальным пользователям.
      console.error(`Delivery ${delivery.id} failed:`, err)
      failed++
    }
  }

  res.status(200).json({ processed: due.length, sent, failed })
}
