import { getDueDeliveries } from '../../server/repositories/deliveries.js'
import { deliverNextChunk } from '../../server/delivery.js'

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
      const result = await deliverNextChunk(delivery)
      if (result.sent) sent++
    } catch (err) {
      // Одна сломанная доставка (например, невалидный chat_id) не должна
      // останавливать рассылку остальным пользователям.
      console.error(`Delivery ${delivery.id} failed:`, err)
      failed++
    }
  }

  res.status(200).json({ processed: due.length, sent, failed })
}
