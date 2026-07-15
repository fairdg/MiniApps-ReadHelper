import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCanAddBook,
  buildProInvoice,
  buildProInvoicePayload,
  getBillingSnapshot,
  parseInvoicePayload,
  validatePreCheckout,
} from '../server/billing.js'

describe('billing helpers', () => {
  test('parses pro invoice payload', () => {
    const payload = buildProInvoicePayload(12345, 111)
    assert.deepEqual(parseInvoicePayload(payload), { kind: 'pro_upgrade', telegramId: 12345 })
  })

  test('builds billing snapshot for free users', () => {
    const snapshot = getBillingSnapshot({ billing_plan: 'free' }, 1)
    assert.equal(snapshot.plan, 'free')
    assert.equal(snapshot.hasPro, false)
    assert.equal(snapshot.canAddBook, false)
    assert.equal(snapshot.freeActiveBooksLimit, 1)
  })

  test('allows pro users to bypass free limit', () => {
    assert.doesNotThrow(() => assertCanAddBook({ billing_plan: 'pro' }, 99))
  })

  test('rejects free users once limit is reached', () => {
    assert.throws(() => assertCanAddBook({ billing_plan: 'free' }, 1), /Оформи Pro/)
  })

  test('validates pre-checkout data', () => {
    const payload = buildProInvoicePayload(777, 222)
    const invoice = buildProInvoice()
    assert.deepEqual(
      validatePreCheckout({
        currency: 'XTR',
        total_amount: invoice.amount,
        invoice_payload: payload,
        from: { id: 777 },
      }),
      { ok: true, kind: 'pro_upgrade', telegramId: 777 },
    )
  })
})
