import { getDb } from '../db.js'

export async function createBook({ userId, title, sourceText }) {
  const sql = getDb()
  const [book] = await sql`
    insert into books (user_id, title, source_text, status)
    values (${userId}, ${title}, ${sourceText}, 'processing')
    returning *
  `
  return book
}

export async function markBookReady(bookId) {
  const sql = getDb()
  await sql`update books set status = 'ready' where id = ${bookId}`
}

export async function markBookFailed(bookId) {
  const sql = getDb()
  await sql`update books set status = 'failed' where id = ${bookId}`
}

export async function listBooksByUser(userId) {
  const sql = getDb()
  return sql`select * from books where user_id = ${userId} order by created_at desc`
}
