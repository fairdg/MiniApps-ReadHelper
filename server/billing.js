const DEFAULT_PRO_PRICE_STARS = 250
const FREE_ACTIVE_BOOKS_LIMIT = 1
const PRO_UPGRADE_KIND = 'pro_upgrade'
const PRO_PAYLOAD_PREFIX = 'pro'

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getProPriceStars() {
  return parsePositiveInt(process.env.TELEGRAM_STARS_PRO_PRICE, DEFAULT_PRO_PRICE_STARS)
}

export function getFreeActiveBooksLimit() {
  return FREE_ACTIVE_BOOKS_LIMIT
}

export function getBillingSnapshot(user, activeBookCount) {
  const plan = user?.billing_plan === 'pro' ? 'pro' : 'free'
  const freeLimit = getFreeActiveBooksLimit()
  const hasPro = plan === 'pro'
  return {
    plan,
    hasPro,
    activeBookCount,
    freeActiveBooksLimit: freeLimit,
    canAddBook: hasPro || activeBookCount < freeLimit,
    proPriceStars: getProPriceStars(),
  }
}

export function assertCanAddBook(user, activeBookCount) {
  const snapshot = getBillingSnapshot(user, activeBookCount)
  if (snapshot.canAddBook) return snapshot

  const err = new Error(
    `На бесплатном плане можно держать только ${snapshot.freeActiveBooksLimit} книгу в процессе. Оформи Pro, чтобы снять лимит.`,
  )
  err.code = 'FREE_PLAN_LIMIT'
  throw err
}

export function buildProInvoicePayload(telegramId, now = Date.now()) {
  return `${PRO_PAYLOAD_PREFIX}:${telegramId}:${now}`
}

export function parseInvoicePayload(payload) {
  if (typeof payload !== 'string') return null
  const [kind, telegramIdRaw] = payload.split(':')
  if (kind !== PRO_PAYLOAD_PREFIX) return null

  const telegramId = Number(telegramIdRaw)
  if (!Number.isInteger(telegramId) || telegramId <= 0) return null

  return {
    kind: PRO_UPGRADE_KIND,
    telegramId,
  }
}

export function validatePreCheckout(preCheckoutQuery) {
  const parsed = parseInvoicePayload(preCheckoutQuery?.invoice_payload)
  if (!parsed) return { ok: false, error: 'Не удалось определить тип покупки.' }

  const expectedAmount = getProPriceStars()
  if (preCheckoutQuery.currency !== 'XTR') {
    return { ok: false, error: 'Поддерживается только оплата в Telegram Stars.' }
  }
  if (preCheckoutQuery.total_amount !== expectedAmount) {
    return { ok: false, error: 'Сумма оплаты больше не актуальна. Открой покупку заново.' }
  }
  if (parsed.telegramId !== preCheckoutQuery.from?.id) {
    return { ok: false, error: 'Оплата доступна только владельцу этого аккаунта.' }
  }

  return { ok: true, kind: parsed.kind, telegramId: parsed.telegramId }
}

export function buildProInvoice() {
  const price = getProPriceStars()
  return {
    title: 'ReadHelper Pro',
    description: 'Снимает лимит бесплатного плана и позволяет держать сколько угодно книг в процессе.',
    currency: 'XTR',
    prices: [{ label: 'ReadHelper Pro', amount: price }],
    amount: price,
  }
}

export { PRO_UPGRADE_KIND }
