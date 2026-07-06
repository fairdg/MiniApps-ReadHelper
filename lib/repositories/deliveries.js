import { getDb } from '../db.js'

const MINUTES_PER_DAY = 24 * 60
const MIN_PER_DAY = 1
const MAX_PER_DAY = 8

// UI даёт пользователю выбирать "уведомлений в день" (1-8) — переводим это
// в interval_minutes, которым реально оперирует расписание доставки.
export function intervalMinutesFromPerDay(notificationsPerDay, fallbackPerDay = 4) {
  const perDay = Math.min(
    MAX_PER_DAY,
    Math.max(MIN_PER_DAY, Math.round(Number(notificationsPerDay) || fallbackPerDay)),
  )
  return Math.round(MINUTES_PER_DAY / perDay)
}

export function perDayFromIntervalMinutes(intervalMinutes) {
  if (!intervalMinutes) return 4
  return Math.max(1, Math.round(MINUTES_PER_DAY / intervalMinutes))
}

// "Тихие часы" — не планируем отправку на ночь. Времена в UTC и соответствуют
// 23:00-08:00 по Томску (UTC+7). Без хранения таймзоны пользователя это
// приближение, а не точный расчёт под конкретного человека.
const QUIET_START_UTC_HOUR = 16 // 23:00 по Томску
const QUIET_END_UTC_HOUR = 1 // 08:00 по Томску

export function avoidQuietHours(date) {
  const hour = date.getUTCHours()
  const inQuietWindow =
    QUIET_START_UTC_HOUR > QUIET_END_UTC_HOUR
      ? hour >= QUIET_START_UTC_HOUR || hour < QUIET_END_UTC_HOUR
      : hour >= QUIET_START_UTC_HOUR && hour < QUIET_END_UTC_HOUR

  if (!inQuietWindow) return date

  const result = new Date(date)
  result.setUTCHours(QUIET_END_UTC_HOUR, 0, 0, 0)
  if (result <= date) result.setUTCDate(result.getUTCDate() + 1)
  return result
}

export async function createDelivery(bookId, intervalMinutes = 240) {
  const sql = getDb()
  const [delivery] = await sql`
    insert into deliveries (book_id, interval_minutes, next_send_at)
    values (${bookId}, ${intervalMinutes}, now())
    returning *
  `
  return delivery
}

export async function getDueDeliveries() {
  const sql = getDb()
  return sql`
    select d.*, b.user_id, b.title, u.telegram_id
    from deliveries d
    join books b on b.id = d.book_id
    join users u on u.id = b.user_id
    where d.is_active = true and d.next_send_at <= now()
  `
}

export async function advanceDelivery(deliveryId, nextPosition, intervalMinutes) {
  const sql = getDb()
  const nextSendAt = avoidQuietHours(new Date(Date.now() + intervalMinutes * 60_000))
  await sql`
    update deliveries
    set next_chunk_position = ${nextPosition},
        next_send_at = ${nextSendAt}
    where id = ${deliveryId}
  `
}

export async function deactivateDelivery(deliveryId) {
  const sql = getDb()
  await sql`update deliveries set is_active = false where id = ${deliveryId}`
}

export async function getDeliveryForBook(bookId) {
  const sql = getDb()
  const [delivery] = await sql`select * from deliveries where book_id = ${bookId}`
  return delivery ?? null
}

// Меняем интервал и сразу пересчитываем ближайшую отправку от текущего
// момента — иначе пользователь меняет частоту, а уже запланированная
// доставка остаётся по старому расписанию до следующего шага.
export async function updateDeliveryInterval(bookId, intervalMinutes) {
  const sql = getDb()
  const nextSendAt = avoidQuietHours(new Date(Date.now() + intervalMinutes * 60_000))
  await sql`
    update deliveries
    set interval_minutes = ${intervalMinutes},
        next_send_at = ${nextSendAt}
    where book_id = ${bookId}
  `
}
