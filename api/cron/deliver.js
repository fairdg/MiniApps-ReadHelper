import { getDueDeliveries, claimDelivery, releaseDeliveryClaim } from '../../server/repositories/deliveries.js'
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
    let claimed = null
    try {
      claimed = await claimDelivery(delivery)
      if (!claimed) continue

      const result = await deliverNextChunk(claimed)
      if (result.sent) sent++
    } catch (err) {
      // Одна сломанная доставка (например, невалидный chat_id) не должна
      // останавливать рассылку остальным пользователям.
      if (claimed) {
        await releaseDeliveryClaim(claimed).catch((releaseErr) => {
          console.error(`Delivery ${delivery.id} claim release failed:`, releaseErr)
        })
      }
      console.error(`Delivery ${delivery.id} failed:`, err)
      failed++
    }
  }

  res.status(200).json({ processed: due.length, sent, failed })
}
