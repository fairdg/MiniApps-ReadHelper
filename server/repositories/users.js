import { getDb } from '../db.js'

// timezone может не прийти (например, апдейт от Telegram-вебхука, у которого
// нет доступа к браузерному Intl) — тогда не затираем уже известное значение.
export async function upsertUser({ telegramId, username, timezone = null }) {
  const sql = getDb()
  const [user] = await sql`
    insert into users (telegram_id, username, timezone)
    values (${telegramId}, ${username}, ${timezone})
    on conflict (telegram_id) do update
      set username = excluded.username,
          timezone = coalesce(excluded.timezone, users.timezone)
    returning *
  `
  return user
}

export async function getUserByTelegramId(telegramId) {
  const sql = getDb()
  const [user] = await sql`select * from users where telegram_id = ${telegramId}`
  return user ?? null
}

// Username хранится без "@", как его отдаёт Telegram — ищем так же. Находит
// только тех, кто хоть раз открывал приложение или писал боту (иначе его
// telegram_id нам просто неоткуда взять).
export async function getUserByUsername(username) {
  const sql = getDb()
  const clean = username.replace(/^@/, '')
  const [user] = await sql`select * from users where lower(username) = lower(${clean})`
  return user ?? null
}

export async function setAdmin(telegramId, isAdmin) {
  const sql = getDb()
  await sql`update users set is_admin = ${isAdmin} where telegram_id = ${telegramId}`
}

export async function listAdmins() {
  const sql = getDb()
  return sql`select telegram_id, username from users where is_admin = true order by username`
}

export async function activateProPlan(telegramId) {
  const sql = getDb()
  const [user] = await sql`
    update users
    set billing_plan = 'pro',
        billing_plan_activated_at = coalesce(billing_plan_activated_at, now())
    where telegram_id = ${telegramId}
    returning *
  `
  return user ?? null
}

export async function setBillingPlan(telegramId, billingPlan) {
  const sql = getDb()
  const [user] = await sql`
    update users
    set billing_plan = ${billingPlan},
        billing_plan_activated_at =
          case
            when ${billingPlan} = 'pro' then coalesce(billing_plan_activated_at, now())
            else null
          end
    where telegram_id = ${telegramId}
    returning *
  `
  return user ?? null
}

export async function listProUsers() {
  const sql = getDb()
  return sql`
    select telegram_id, username, billing_plan_activated_at
    from users
    where billing_plan = 'pro'
    order by billing_plan_activated_at desc nulls last, username
  `
}
