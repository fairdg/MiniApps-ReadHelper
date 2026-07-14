import crypto from 'node:crypto'

function readHeader(req, name) {
  return req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()] ?? null
}

function timingSafeEqualHex(expectedHex, actualHex) {
  if (typeof expectedHex !== 'string' || typeof actualHex !== 'string') return false
  if (expectedHex.length !== actualHex.length) return false
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'))
}

function parseTelegramUser(rawUser) {
  let user
  try {
    user = JSON.parse(rawUser)
  } catch {
    throw new Error('Invalid Telegram user payload')
  }

  const telegramId = Number(user?.id)
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    throw new Error('Invalid Telegram user id')
  }

  return {
    telegramId,
    username: user?.username ?? null,
  }
}

export function verifyTelegramInitData(initData, botToken) {
  if (!initData) throw new Error('Missing Telegram initData')
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('Missing Telegram initData hash')

  const entries = []
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue
    entries.push([key, value])
  }

  const dataCheckString = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  if (!timingSafeEqualHex(expectedHash, hash)) {
    throw new Error('Invalid Telegram initData hash')
  }

  return {
    ...parseTelegramUser(params.get('user')),
    isDev: false,
  }
}

function canUseDevAuth({ nodeEnv, vercelEnv }) {
  return nodeEnv !== 'production' && vercelEnv !== 'production'
}

function parseDevAuth(encoded) {
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Invalid development auth payload')
  }

  const telegramId = Number(parsed?.telegramId)
  if (!Number.isInteger(telegramId) || telegramId >= 0) {
    throw new Error('Development auth requires a negative telegramId')
  }

  return {
    telegramId,
    username: parsed?.username ?? null,
    isDev: true,
  }
}

export function getAuthFromRequest(
  req,
  {
    telegramBotToken = process.env.TELEGRAM_BOT_TOKEN,
    nodeEnv = process.env.NODE_ENV,
    vercelEnv = process.env.VERCEL_ENV,
  } = {},
) {
  const initData = readHeader(req, 'x-telegram-init-data')
  if (initData) {
    return verifyTelegramInitData(initData, telegramBotToken)
  }

  const devAuth = readHeader(req, 'x-readhelper-dev-auth')
  if (devAuth) {
    if (!canUseDevAuth({ nodeEnv, vercelEnv })) {
      throw new Error('Development auth is disabled')
    }
    return parseDevAuth(devAuth)
  }

  throw new Error('Authentication is required')
}

export function requireAuth(req, res) {
  try {
    return getAuthFromRequest(req)
  } catch (err) {
    res.status(401).json({ error: err.message })
    return null
  }
}
