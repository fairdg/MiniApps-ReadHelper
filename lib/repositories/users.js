import { getDb } from '../db.js'

export async function upsertUser({ telegramId, username }) {
  const sql = getDb()
  const [user] = await sql`
    insert into users (telegram_id, username)
    values (${telegramId}, ${username})
    on conflict (telegram_id) do update set username = excluded.username
    returning *
  `
  return user
}

export async function getUserByTelegramId(telegramId) {
  const sql = getDb()
  const [user] = await sql`select * from users where telegram_id = ${telegramId}`
  return user ?? null
}
