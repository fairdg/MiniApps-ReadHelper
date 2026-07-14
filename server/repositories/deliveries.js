import { getDb } from '../db.js'

const LEGACY_MINUTES_PER_DAY = 24 * 60
const MIN_PER_DAY = 1
const QUIET_START_HOUR = 23
const QUIET_END_HOUR = 8
const ACTIVE_MINUTES_PER_DAY = ((QUIET_START_HOUR - QUIET_END_HOUR + 24) % 24) * 60

// Ограничено 14, чтобы не обещать частоту, которую невозможно честно
// выдержать в окне 08:00-23:00.
const MAX_PER_DAY = 14

function clampPerDay(notificationsPerDay, fallbackPerDay = 4) {
  return Math.min(
    MAX_PER_DAY,
    Math.max(MIN_PER_DAY, Math.round(Number(notificationsPerDay) || fallbackPerDay)),
  )
}

// Пользователь выбирает число доставок именно внутри разрешённого окна, а не
// по полным 24 часам. Иначе UI показывает 14/день, а ночная пауза физически
// съедает заметную часть отправок.
export function intervalMinutesFromPerDay(notificationsPerDay, fallbackPerDay = 4) {
  return Math.max(
    1,
    Math.round(ACTIVE_MINUTES_PER_DAY / clampPerDay(notificationsPerDay, fallbackPerDay)),
  )
}

function legacyPerDayFromIntervalMinutes(intervalMinutes, fallbackPerDay = 4) {
  if (!intervalMinutes) return fallbackPerDay
  return clampPerDay(Math.round(LEGACY_MINUTES_PER_DAY / intervalMinutes), fallbackPerDay)
}

export function notificationsPerDayFromDelivery(delivery, fallbackPerDay = 4) {
  if (!delivery) return fallbackPerDay
  if (delivery.notifications_per_day != null) {
    return clampPerDay(delivery.notifications_per_day, fallbackPerDay)
  }
  return legacyPerDayFromIntervalMinutes(delivery.interval_minutes, fallbackPerDay)
}

function intervalMinutesFromDelivery(delivery, fallbackPerDay = 4) {
  return intervalMinutesFromPerDay(notificationsPerDayFromDelivery(delivery, fallbackPerDay), fallbackPerDay)
}

function resolveZone(timeZone) {
  // Дефолт-параметр не сработает для явного null (только для undefined),
  // а из БД timezone у пользователя без сохранённой зоны приходит именно null.
  return timeZone || 'UTC'
}

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

// "Тихие часы" — не отправляем на ночь пользователя, 23:00-08:00 по его
// локальной IANA-таймзоне. Это проверяется и при планировании, и как жёсткий
// предохранитель при самой выборке просроченных доставок.
export function isQuietHours(date, timeZone) {
  const zone = resolveZone(timeZone)
  const hour = localHour(date, zone)
  return QUIET_START_HOUR > QUIET_END_HOUR
    ? hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
    : hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR
}

export function avoidQuietHours(date, timeZone) {
  const zone = resolveZone(timeZone)
  if (!isQuietHours(date, zone)) return date

  const offset = utcOffsetMinutes(date, zone)
  const local = new Date(date.getTime() + offset * 60_000)
  const localTarget = new Date(local)
  localTarget.setUTCHours(QUIET_END_HOUR, 0, 0, 0)
  if (localTarget <= local) localTarget.setUTCDate(localTarget.getUTCDate() + 1)

  return new Date(localTarget.getTime() - offset * 60_000)
}

export function nextScheduleBase({ scheduledAt, intervalMinutes, now = new Date() }) {
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) return now

  // Небольшое отставание крона не должно копиться как дрейф. Но если job
  // пролежал дольше полного интервала, лучше стартовать заново от текущего
  // времени, а не устраивать backlog из "догоняющих" сообщений.
  return now.getTime() - scheduledAt.getTime() > intervalMinutes * 60_000 ? now : scheduledAt
}

export async function createDelivery(bookId, notificationsPerDay = 4, timezone) {
  const sql = getDb()
  const perDay = clampPerDay(notificationsPerDay)
  const intervalMinutes = intervalMinutesFromPerDay(perDay)
  const nextSendAt = avoidQuietHours(new Date(), timezone)
  const [delivery] = await sql`
    insert into deliveries (book_id, interval_minutes, notifications_per_day, next_send_at)
    values (${bookId}, ${intervalMinutes}, ${perDay}, ${nextSendAt})
    returning *
  `
  return delivery
}

export async function getDueDeliveries(now = new Date()) {
  const sql = getDb()
  const due = await sql`
    select d.*, b.user_id, b.title, u.telegram_id, u.timezone
    from deliveries d
    join books b on b.id = d.book_id
    join users u on u.id = b.user_id
    where d.is_active = true and d.next_send_at <= now()
  `
  return due.filter((delivery) => !isQuietHours(now, delivery.timezone))
}

export async function advanceDelivery(delivery, nextPosition, now = new Date()) {
  const sql = getDb()
  const perDay = notificationsPerDayFromDelivery(delivery)
  const intervalMinutes = intervalMinutesFromPerDay(perDay)
  const scheduledAt = delivery.next_send_at ? new Date(delivery.next_send_at) : now
  const base = nextScheduleBase({ scheduledAt, intervalMinutes, now })
  const nextSendAt = avoidQuietHours(new Date(base.getTime() + intervalMinutes * 60_000), delivery.timezone)
  await sql`
    update deliveries
    set next_chunk_position = ${nextPosition},
        interval_minutes = ${intervalMinutes},
        notifications_per_day = ${perDay},
        next_send_at = ${nextSendAt}
    where id = ${delivery.id}
  `
}

// nextPosition необязателен: передаём его при завершении книги (последний
// чанк только что отправлен), чтобы прогресс в UI показывал "всё прочитано",
// а не застревал на предпоследней порции.
export async function deactivateDelivery(deliveryId, nextPosition) {
  const sql = getDb()
  if (nextPosition == null) {
    await sql`update deliveries set is_active = false where id = ${deliveryId}`
  } else {
    await sql`
      update deliveries
      set is_active = false, next_chunk_position = ${nextPosition}
      where id = ${deliveryId}
    `
  }
}

// После пересборки порций (смена размера) старые позиции чанков не значат то
// же самое — вызывающий пересчитывает позицию по примерному смещению в тексте
// и просто переставляет курсор, не трогая расписание/паузу/активность.
export async function setDeliveryPosition(bookId, position) {
  const sql = getDb()
  await sql`update deliveries set next_chunk_position = ${position} where book_id = ${bookId}`
}

// Перечитать книгу с начала (режим разработчика) — курсор на 0, доставка
// снова активна (даже если была на паузе/дочитана), первая порция уйдёт по
// обычному расписанию с этого момента.
export async function resetProgress(bookId, timezone) {
  const sql = getDb()
  const nextSendAt = avoidQuietHours(new Date(), timezone)
  await sql`
    update deliveries
    set next_chunk_position = 0, is_active = true, next_send_at = ${nextSendAt}
    where book_id = ${bookId}
  `
}

export async function getDeliveryForBook(bookId) {
  const sql = getDb()
  const [delivery] = await sql`select * from deliveries where book_id = ${bookId}`
  return delivery ?? null
}

// Пауза/продолжение по кнопке пользователя — использует то же поле
// is_active, что и автозавершение по прочтении. Отличить "пауза" от
// "дочитано" можно по read_chunks < total_chunks (это уже проверяется в UI).
export async function setDeliveryActive(bookId, isActive) {
  const sql = getDb()
  await sql`update deliveries set is_active = ${isActive} where book_id = ${bookId}`
}

// Меняем частоту и сразу пересчитываем ближайшую отправку от текущего
// момента — иначе пользователь меняет настройку, а уже запланированная
// доставка остаётся по старому расписанию до следующего шага.
export async function updateDeliveryInterval(bookId, notificationsPerDay, timezone) {
  const sql = getDb()
  const perDay = clampPerDay(notificationsPerDay)
  const intervalMinutes = intervalMinutesFromPerDay(perDay)
  const nextSendAt = avoidQuietHours(new Date(Date.now() + intervalMinutes * 60_000), timezone)
  await sql`
    update deliveries
    set interval_minutes = ${intervalMinutes},
        notifications_per_day = ${perDay},
        next_send_at = ${nextSendAt}
    where book_id = ${bookId}
  `
}
