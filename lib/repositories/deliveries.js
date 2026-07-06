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
  await sql`
    update deliveries
    set next_chunk_position = ${nextPosition},
        next_send_at = now() + (${intervalMinutes} || ' minutes')::interval
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
  await sql`
    update deliveries
    set interval_minutes = ${intervalMinutes},
        next_send_at = now() + (${intervalMinutes} || ' minutes')::interval
    where book_id = ${bookId}
  `
}
