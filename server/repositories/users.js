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
