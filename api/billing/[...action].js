import { requireAuth } from '../../server/auth.js'
import { isOwner } from '../../server/adminAccess.js'
import { buildProInvoice, buildProInvoicePayload, getBillingSnapshot } from '../../server/billing.js'
import { createInvoiceLink } from '../../server/telegram.js'
import {
  getUserByTelegramId,
  upsertUser,
  getUserByUsername,
  listProUsers,
  setBillingPlan,
} from '../../server/repositories/users.js'
import { countActiveBooksByUser } from '../../server/repositories/books.js'

function getAction(req) {
  const value = req.query.action
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value) return [value]
  return []
}

async function getOrCreateUser(auth) {
  let user = await getUserByTelegramId(auth.telegramId)
  if (!user) {
    user = await upsertUser({ telegramId: auth.telegramId, username: auth.username })
  }
  return user
}

async function handleStatus(res, auth) {
  const user = await getOrCreateUser(auth)
  const activeBookCount = await countActiveBooksByUser(user.id)
  res.status(200).json(getBillingSnapshot(user, activeBookCount))
}

async function handleInvoice(res, auth) {
  const user = await getOrCreateUser(auth)
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

async function handleGrants(req, res, auth) {
  if (!isOwner(auth.telegramId)) {
    res.status(403).json({ error: 'Управлять подписками может только владелец' })
    return
  }

  if (req.method === 'GET') {
    const users = await listProUsers()
    res.status(200).json({ users })
    return
  }

  if (req.method === 'POST') {
    const username = req.body?.username?.trim()
    if (!username) {
      res.status(400).json({ error: 'Укажи username' })
      return
    }

    const user = await getUserByUsername(username)
    if (!user) {
      res.status(404).json({ error: 'Пользователь ещё не открывал приложение — выдать подписку нельзя' })
      return
    }

    await setBillingPlan(user.telegram_id, 'pro')
    res.status(200).json({ added: true })
    return
  }

  if (req.method === 'DELETE') {
    const targetTelegramId = req.body?.targetTelegramId
    if (!targetTelegramId) {
      res.status(400).json({ error: 'targetTelegramId обязателен' })
      return
    }

    await setBillingPlan(Number(targetTelegramId), 'free')
    res.status(200).json({ removed: true })
    return
  }

  res.status(405).end()
}

export default async function handler(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return

  const action = getAction(req)
  if (action.length !== 1) {
    res.status(404).json({ error: 'Маршрут не найден' })
    return
  }

  if (action[0] === 'status') {
    if (req.method !== 'GET') return res.status(405).end()
    return handleStatus(res, auth)
  }

  if (action[0] === 'invoice') {
    if (req.method !== 'POST') return res.status(405).end()
    return handleInvoice(res, auth)
  }

  if (action[0] === 'grants') {
    return handleGrants(req, res, auth)
  }

  res.status(404).json({ error: 'Маршрут не найден' })
}
