import { getDb } from '../db.js'

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
