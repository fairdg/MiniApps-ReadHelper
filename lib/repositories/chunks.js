import { getDb } from '../db.js'

export async function saveChunks(bookId, chunks) {
  const sql = getDb()
  for (let position = 0; position < chunks.length; position++) {
    await sql`
      insert into chunks (book_id, position, content)
      values (${bookId}, ${position}, ${chunks[position]})
      on conflict (book_id, position) do update set content = excluded.content
    `
  }
}

export async function getChunk(bookId, position) {
  const sql = getDb()
  const [chunk] = await sql`
    select * from chunks where book_id = ${bookId} and position = ${position}
  `
  return chunk ?? null
}

export async function countChunks(bookId) {
  const sql = getDb()
  const [row] = await sql`select count(*)::int as count from chunks where book_id = ${bookId}`
  return row.count
}

export async function getChunksForBook(bookId) {
  const sql = getDb()
  return sql`
    select position, content
    from chunks
    where book_id = ${bookId}
    order by position asc
  `
}
