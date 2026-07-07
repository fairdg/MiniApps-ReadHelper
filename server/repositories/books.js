import { getDb } from '../db.js'

export async function createBook({ userId, title, sourceText, targetWords = 120 }) {
  const sql = getDb()
  const [book] = await sql`
    insert into books (user_id, title, source_text, status, target_words)
    values (${userId}, ${title}, ${sourceText}, 'processing', ${targetWords})
    returning *
  `
  return book
}

export async function updateTargetWords(bookId, targetWords) {
  const sql = getDb()
  await sql`update books set target_words = ${targetWords} where id = ${bookId}`
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

export async function getBookById(bookId) {
  const sql = getDb()
  const [book] = await sql`select * from books where id = ${bookId}`
  return book ?? null
}

// chunks/deliveries удаляются каскадом (on delete cascade в схеме).
export async function deleteBook(bookId) {
  const sql = getDb()
  await sql`delete from books where id = ${bookId}`
}

export async function listBooksWithProgress(userId) {
  const sql = getDb()
  return sql`
    select
      b.id,
      b.title,
      b.status,
      b.created_at,
      coalesce(c.total, 0)::int as total_chunks,
      coalesce(d.next_chunk_position, 0)::int as read_chunks,
      coalesce(d.is_active, false) as delivery_active
    from books b
    left join (
      select book_id, count(*) as total from chunks group by book_id
    ) c on c.book_id = b.id
    left join deliveries d on d.book_id = b.id
    where b.user_id = ${userId}
    order by b.created_at desc
  `
}
