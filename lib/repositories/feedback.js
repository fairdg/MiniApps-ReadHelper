import { getDb } from '../db.js'

export async function createFeedback({ userId, message }) {
  const sql = getDb()
  const [row] = await sql`
    insert into feedback (user_id, message)
    values (${userId}, ${message})
    returning *
  `
  return row
}
