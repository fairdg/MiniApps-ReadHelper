import { splitIntoChunks as aiSplit } from './deepseek.js'

const MAX_BLOCK_CHARS = 6000
const TARGET_WORDS = 250

function splitByParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function fallbackChunk(text, targetWords = TARGET_WORDS) {
  const paragraphs = splitByParagraphs(text)
  const chunks = []
  let current = ''
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).length

    if (currentWords + words > targetWords && current) {
      chunks.push(current.trim())
      current = ''
      currentWords = 0
    }

    current += (current ? '\n\n' : '') + paragraph
    currentWords += words
  }

  if (current) chunks.push(current.trim())
  return chunks
}

function splitIntoBlocks(text, maxChars = MAX_BLOCK_CHARS) {
  const paragraphs = splitByParagraphs(text)
  const blocks = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > maxChars && current) {
      blocks.push(current)
      current = ''
    }
    current += (current ? '\n\n' : '') + paragraph
  }

  if (current) blocks.push(current)
  return blocks
}

// Разбивает книгу на порции для рассылки: сперва пробует ИИ (учитывает
// смысловые границы), при ошибке ИИ на конкретном блоке — откатывается на
// разбиение по абзацам, чтобы обработка книги не падала целиком.
export async function chunkBook(text, { useAi = true } = {}) {
  if (!useAi) return fallbackChunk(text)

  const blocks = splitIntoBlocks(text)
  const allChunks = []

  for (const block of blocks) {
    try {
      allChunks.push(...(await aiSplit(block)))
    } catch (err) {
      console.error('DeepSeek chunking failed for block, falling back:', err)
      allChunks.push(...fallbackChunk(block))
    }
  }

  return allChunks
}
