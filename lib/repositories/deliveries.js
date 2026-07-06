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

// "Тихие часы" — не планируем отправку на ночь пользователя, 23:00-08:00 по
// ЕГО местному времени (IANA-таймзона из users.timezone, определяется на
// фронте через Intl и сохраняется при добавлении книги). Без таймзоны
// (timezone == null, например пользователь ни разу не открывал мини-аппу)
// используем UTC — это грубое приближение, но лучше, чем считать всех
// пользователями одного конкретного города.
const QUIET_START_HOUR = 23
const QUIET_END_HOUR = 8

function localHour(date, timeZone) {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date),
  )
}

// Разница между локальным временем зоны и UTC в минутах, на конкретный момент
// (учитывает переход на летнее/зимнее время, если он есть в этой зоне).
function utcOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )

  return Math.round((asUtc - date.getTime()) / 60_000)
}

export function avoidQuietHours(date, timeZone) {
  // Дефолт-параметр не сработает для явного null (только для undefined),
  // а из БД timezone у пользователя без сохранённой зоны приходит именно null.
  const zone = timeZone || 'UTC'
  const hour = localHour(date, zone)
  const inQuietWindow =
    QUIET_START_HOUR > QUIET_END_HOUR
      ? hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
      : hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR

  if (!inQuietWindow) return date

  const offset = utcOffsetMinutes(date, zone)
  const local = new Date(date.getTime() + offset * 60_000)
  const localTarget = new Date(local)
  localTarget.setUTCHours(QUIET_END_HOUR, 0, 0, 0)
  if (localTarget <= local) localTarget.setUTCDate(localTarget.getUTCDate() + 1)

  return new Date(localTarget.getTime() - offset * 60_000)
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
    select d.*, b.user_id, b.title, u.telegram_id, u.timezone
    from deliveries d
    join books b on b.id = d.book_id
    join users u on u.id = b.user_id
    where d.is_active = true and d.next_send_at <= now()
  `
}

export async function advanceDelivery(deliveryId, nextPosition, intervalMinutes, timezone) {
  const sql = getDb()
  const nextSendAt = avoidQuietHours(new Date(Date.now() + intervalMinutes * 60_000), timezone)
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
export async function updateDeliveryInterval(bookId, intervalMinutes, timezone) {
  const sql = getDb()
  const nextSendAt = avoidQuietHours(new Date(Date.now() + intervalMinutes * 60_000), timezone)
  await sql`
    update deliveries
    set interval_minutes = ${intervalMinutes},
        next_send_at = ${nextSendAt}
    where book_id = ${bookId}
  `
}
