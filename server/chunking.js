import { splitIntoChunks as aiSplit } from './gemini.js'

const MAX_BLOCK_CHARS = 6000
// "Порция как новость" — читается за минуту-две, не разворот текста.
const TARGET_WORDS = 120
// Telegram отклоняет сообщения длиннее 4096 символов — берём с запасом,
// т.к. ИИ иногда игнорирует просьбу дробить и возвращает кусок целиком.
const TELEGRAM_SAFE_CHARS = 3500

// Границы, в которых пользователь может регулировать размер порции.
export const MIN_TARGET_WORDS = 40
export const MAX_TARGET_WORDS = 300

export function clampTargetWords(value, fallback = TARGET_WORDS) {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num)) return fallback
  return Math.min(MAX_TARGET_WORDS, Math.max(MIN_TARGET_WORDS, num))
}

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

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

// Режет один чанк, который сильно длиннее ориентира, по предложениям —
// то же самое, что splitByLength делает по символам под лимит Telegram, но
// здесь порог в словах, применяется раньше и мягче (не аварийный лимит, а
// подгонка под желаемый размер порции).
function splitByWordCount(text, maxWords) {
  if (countWords(text) <= maxWords) return [text]

  const sentences = text.split(/(?<=[.!?])\s+/)
  const pieces = []
  let current = ''
  let currentWords = 0

  for (const sentence of sentences) {
    const words = countWords(sentence)
    if (currentWords + words > maxWords && current) {
      pieces.push(current.trim())
      current = ''
      currentWords = 0
    }
    current += (current ? ' ' : '') + sentence
    currentWords += words
  }

  if (current) pieces.push(current.trim())
  return pieces
}

// ИИ-дробление (с прошлой правки) намеренно ставит смысловые границы выше
// точного числа слов — для обычной книжной прозы это даёт естественные
// порции чуть короче/длиннее ориентира. Но для текста с обилием коротких
// фрагментов (веб-статьи: заголовки, списки, сноски-цитаты) получается
// неконтролируемый разброс — от пары слов до сотен в одном чанке. Досводим
// результат к targetWords уже после ИИ/фолбэка: слишком длинные чанки режем
// по предложениям, слишком короткие — склеиваем с соседними.
function renormalizeToTargetWords(chunks, targetWords) {
  const maxWords = targetWords * 2
  const minWords = Math.max(1, Math.round(targetWords * 0.4))

  const split = chunks.flatMap((chunk) => splitByWordCount(chunk, maxWords))

  const merged = []
  for (const chunk of split) {
    const words = countWords(chunk)
    const last = merged[merged.length - 1]
    const lastWords = last ? countWords(last) : 0

    if (last && lastWords < minWords && lastWords + words <= maxWords) {
      merged[merged.length - 1] = last + '\n\n' + chunk
    } else {
      merged.push(chunk)
    }
  }

  return merged
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

async function chunkText(text, { useAi, targetWords }) {
  if (!useAi) return enforceMaxChars(renormalizeToTargetWords(fallbackChunk(text, targetWords), targetWords))

  const blocks = splitIntoBlocks(text)
  const allChunks = []

  for (const block of blocks) {
    try {
      allChunks.push(...(await aiSplit(block, { targetWords })))
    } catch (err) {
      console.error('Gemini chunking failed for block, falling back:', err)
      allChunks.push(...fallbackChunk(block, targetWords))
    }
  }

  return enforceMaxChars(renormalizeToTargetWords(allChunks, targetWords))
}

// Разбивает книгу на порции для рассылки: сперва находит границы глав (если
// они есть), затем внутри каждой главы пробует ИИ (учитывает смысловые
// границы), при ошибке ИИ на конкретном блоке — откатывается на разбиение по
// абзацам. Возвращает [{ chapter, content }], chapter === null, если заголовки
// глав не были обнаружены. targetWords — ориентир размера порции, настраиваемый
// пользователем (по умолчанию TARGET_WORDS); Gemini и фолбэк уже сами решают,
// что порция может быть короче/длиннее ориентира ради смысловых границ.
export async function chunkBook(text, { useAi = true, targetWords = TARGET_WORDS } = {}) {
  const chapters = splitByChapters(text)
  const result = []

  for (const chapter of chapters) {
    const pieces = await chunkText(chapter.content, { useAi, targetWords })
    for (const content of pieces) {
      result.push({ chapter: chapter.title, content })
    }
  }

  return result
}
