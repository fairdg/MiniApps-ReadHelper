import { requireAuth } from '../../server/auth.js'
import { buildProInvoice, buildProInvoicePayload } from '../../server/billing.js'
import { createInvoiceLink } from '../../server/telegram.js'
import { getUserByTelegramId, upsertUser } from '../../server/repositories/users.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const auth = requireAuth(req, res)
  if (!auth) return

  let user = await getUserByTelegramId(auth.telegramId)
  if (!user) {
    user = await upsertUser({ telegramId: auth.telegramId, username: auth.username })
  }

  if (user.billing_plan === 'pro') {
    res.status(409).json({ error: 'Pro уже активирован.' })
    return
  }

  const invoice = buildProInvoice()
  const payload = buildProInvoicePayload(auth.telegramId)
  const invoiceLink = await createInvoiceLink({
    title: invoice.title,
    description: invoice.description,
    payload,
    provider_token: '',
    currency: invoice.currency,
    prices: invoice.prices,
  })

  res.status(200).json({
    invoiceLink,
    amount: invoice.amount,
    currency: invoice.currency,
    title: invoice.title,
  })
}
