import { getDb } from '../db.js'

// chunks: [{ chapter: string|null, content: string }]
export async function saveChunks(bookId, chunks) {
  const sql = getDb()
  for (let position = 0; position < chunks.length; position++) {
    const { chapter = null, content } = chunks[position]
    await sql`
      insert into chunks (book_id, position, content, chapter)
      values (${bookId}, ${position}, ${content}, ${chapter})
      on conflict (book_id, position) do update
        set content = excluded.content, chapter = excluded.chapter
    `
  }
}

// Используется при пересборке порций (смена размера порции для уже
// добавленной книги) — старые чанки больше не соответствуют новому targetWords.
export async function deleteChunksForBook(bookId) {
  const sql = getDb()
  await sql`delete from chunks where book_id = ${bookId}`
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
    select position, content, chapter
    from chunks
    where book_id = ${bookId}
    order by position asc
  `
}
