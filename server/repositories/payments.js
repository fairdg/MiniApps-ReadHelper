import { getDb } from '../db.js'

export async function createPayment({
  userId,
  kind,
  currency,
  totalAmount,
  invoicePayload,
  telegramPaymentChargeId,
  providerPaymentChargeId = null,
  rawPayment = null,
}) {
  const sql = getDb()
  const [payment] = await sql`
    insert into payments (
      user_id,
      kind,
      status,
      currency,
      total_amount,
      invoice_payload,
      telegram_payment_charge_id,
      provider_payment_charge_id,
      raw_payment
    )
    values (
      ${userId},
      ${kind},
      'paid',
      ${currency},
      ${totalAmount},
      ${invoicePayload},
      ${telegramPaymentChargeId},
      ${providerPaymentChargeId},
      ${rawPayment ? JSON.stringify(rawPayment) : null}::jsonb
    )
    on conflict (telegram_payment_charge_id) do nothing
    returning *
  `
  return payment ?? null
}
