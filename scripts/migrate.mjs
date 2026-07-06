import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl || databaseUrl.includes('REPLACE_WITH')) {
  console.error('DATABASE_URL не задан (запускай через npm run migrate)')
  process.exit(1)
}

const schemaPath = fileURLToPath(new URL('../server/db/schema.sql', import.meta.url))
const schema = readFileSync(schemaPath, 'utf8')

// Neon HTTP-драйвер выполняет один стейтмент за раз, поэтому schema.sql
// режем по ";" и прогоняем последовательно (порядок важен из-за foreign key).
const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

const sql = neon(databaseUrl)

for (const statement of statements) {
  await sql(statement)
  console.log('OK:', statement.split('\n')[0])
}

console.log(`Схема применена успешно (${statements.length} стейтментов)`)
