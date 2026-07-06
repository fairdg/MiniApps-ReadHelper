import { splitIntoChunks as aiSplit } from './gemini.js'

const MAX_BLOCK_CHARS = 6000
const TARGET_WORDS = 250
// Telegram отклоняет сообщения длиннее 4096 символов — берём с запасом,
// т.к. ИИ иногда игнорирует просьбу дробить и возвращает кусок целиком.
const TELEGRAM_SAFE_CHARS = 3500

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

// Жёсткая страховка на случай, если ИИ (или фолбэк) всё равно вернул кусок
// длиннее лимита Telegram: режем сначала по абзацам, а если и отдельный
// абзац слишком длинный — по предложениям.
function splitByLength(text, maxChars) {
  if (text.length <= maxChars) return [text]

  const paragraphs = splitByParagraphs(text)
  const pieces = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) {
        pieces.push(current)
        current = ''
      }

      const sentences = paragraph.split(/(?<=[.!?])\s+/)
      let sentenceChunk = ''

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length + 1 > maxChars && sentenceChunk) {
          pieces.push(sentenceChunk.trim())
          sentenceChunk = ''
        }
        sentenceChunk += (sentenceChunk ? ' ' : '') + sentence
      }

      if (sentenceChunk) pieces.push(sentenceChunk.trim())
      continue
    }

    if (current.length + paragraph.length > maxChars && current) {
      pieces.push(current)
      current = ''
    }
    current += (current ? '\n\n' : '') + paragraph
  }

  if (current) pieces.push(current)
  return pieces
}

function enforceMaxChars(chunks, maxChars = TELEGRAM_SAFE_CHARS) {
  return chunks.flatMap((chunk) => splitByLength(chunk, maxChars))
}

// Заголовок главы — короткий абзац вида "Глава 3", "Часть вторая", "Chapter 4".
// Эвристика, не парсер: не находит глав — просто нет группировки в UI, не ошибка.
const CHAPTER_HEADING_RE = /^(глава|часть|chapter|part)\s+[\dа-яёa-z]+/i
const CHAPTER_HEADING_MAX_CHARS = 80

function splitByChapters(text) {
  const paragraphs = splitByParagraphs(text)
  const chapters = []
  let currentTitle = null
  let currentParagraphs = []

  const flush = () => {
    if (currentParagraphs.length) {
      chapters.push({ title: currentTitle, content: currentParagraphs.join('\n\n') })
    }
  }

  for (const paragraph of paragraphs) {
    const isHeading =
      paragraph.length <= CHAPTER_HEADING_MAX_CHARS && CHAPTER_HEADING_RE.test(paragraph)

    if (isHeading) {
      flush()
      currentTitle = paragraph
      currentParagraphs = []
    } else {
      currentParagraphs.push(paragraph)
    }
  }

  flush()

  // Заголовков не нашли — вся книга одной "безымянной" главой.
  return chapters.length ? chapters : [{ title: null, content: text }]
}

async function chunkText(text, { useAi }) {
  if (!useAi) return enforceMaxChars(fallbackChunk(text))

  const blocks = splitIntoBlocks(text)
  const allChunks = []

  for (const block of blocks) {
    try {
      allChunks.push(...(await aiSplit(block)))
    } catch (err) {
      console.error('Gemini chunking failed for block, falling back:', err)
      allChunks.push(...fallbackChunk(block))
    }
  }

  return enforceMaxChars(allChunks)
}

// Разбивает книгу на порции для рассылки: сперва находит границы глав (если
// они есть), затем внутри каждой главы пробует ИИ (учитывает смысловые
// границы), при ошибке ИИ на конкретном блоке — откатывается на разбиение по
// абзацам. Возвращает [{ chapter, content }], chapter === null, если заголовки
// глав не были обнаружены.
export async function chunkBook(text, { useAi = true } = {}) {
  const chapters = splitByChapters(text)
  const result = []

  for (const chapter of chapters) {
    const pieces = await chunkText(chapter.content, { useAi })
    for (const content of pieces) {
      result.push({ chapter: chapter.title, content })
    }
  }

  return result
}
