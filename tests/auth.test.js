import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getAuthFromRequest, verifyTelegramInitData } from '../server/auth.js'

function buildInitData({ botToken, user, authDate = 1_784_000_000, extra = {} }) {
  const fields = {
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(user),
    ...extra,
  }

  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  return new URLSearchParams({ ...fields, hash }).toString()
}

describe('verifyTelegramInitData', () => {
  test('accepts a valid Telegram Web App signature', () => {
    const initData = buildInitData({
      botToken: 'test-bot-token',
      user: { id: 12345, username: 'reader' },
    })

    const auth = verifyTelegramInitData(initData, 'test-bot-token')
    assert.equal(auth.telegramId, 12345)
    assert.equal(auth.username, 'reader')
  })

  test('rejects a tampered hash', () => {
    const valid = buildInitData({
      botToken: 'test-bot-token',
      user: { id: 12345, username: 'reader' },
    })
    const params = new URLSearchParams(valid)
    params.set('hash', '0'.repeat(64))

    assert.throws(() => verifyTelegramInitData(params.toString(), 'test-bot-token'), /Invalid Telegram initData hash/)
  })
})

describe('getAuthFromRequest', () => {
  test('reads Telegram auth from request headers', () => {
    const initData = buildInitData({
      botToken: 'test-bot-token',
      user: { id: 777, username: 'alice' },
    })

    const auth = getAuthFromRequest(
      { headers: { 'x-telegram-init-data': initData } },
      { telegramBotToken: 'test-bot-token', nodeEnv: 'production', vercelEnv: 'production' },
    )

    assert.deepEqual(auth, { telegramId: 777, username: 'alice', isDev: false })
  })

  test('allows local dev auth only outside production and only for negative ids', () => {
    const devHeader = Buffer.from(JSON.stringify({ telegramId: -42, username: 'dev_user' })).toString('base64url')

    const auth = getAuthFromRequest(
      { headers: { 'x-readhelper-dev-auth': devHeader } },
      { telegramBotToken: '', nodeEnv: 'development', vercelEnv: 'development' },
    )

    assert.deepEqual(auth, { telegramId: -42, username: 'dev_user', isDev: true })
  })

  test('rejects local dev auth in production', () => {
    const devHeader = Buffer.from(JSON.stringify({ telegramId: -42, username: 'dev_user' })).toString('base64url')

    assert.throws(
      () =>
        getAuthFromRequest(
          { headers: { 'x-readhelper-dev-auth': devHeader } },
          { telegramBotToken: '', nodeEnv: 'production', vercelEnv: 'production' },
        ),
      /Development auth is disabled/,
    )
  })
})
