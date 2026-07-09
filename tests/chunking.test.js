import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { chunkBook, clampTargetWords, MIN_TARGET_WORDS, MAX_TARGET_WORDS } from '../server/chunking.js'

describe('clampTargetWords', () => {
  // Пользователь не может выставить меньше MIN_TARGET_WORDS через API напрямую.
  test('clamps below the minimum', () => {
    assert.equal(clampTargetWords(1), MIN_TARGET_WORDS)
  })

  // И не может выставить больше MAX_TARGET_WORDS.
  test('clamps above the maximum', () => {
    assert.equal(clampTargetWords(10000), MAX_TARGET_WORDS)
  })

  // Значение внутри допустимого диапазона должно пройти без изменений.
  test('passes through a value already in range', () => {
    assert.equal(clampTargetWords(150), 150)
  })

  // targetWords — счётчик слов, дробных значений быть не должно.
  test('rounds a fractional value', () => {
    assert.equal(clampTargetWords(120.6), 121)
  })

  test('falls back to the default for values Number() turns into NaN', () => {
    assert.equal(clampTargetWords('not a number', 120), 120)
    assert.equal(clampTargetWords(undefined, 120), 120)
  })

  test('treats null as 0 (Number(null) === 0), clamped to the minimum — not the fallback', () => {
    assert.equal(clampTargetWords(null, 120), MIN_TARGET_WORDS)
  })
})

// useAi: false везде — тестируем детерминированный фолбэк-путь без сетевых
// вызовов к Gemini (splitByChapters/enforceMaxChars отрабатывают одинаково
// независимо от useAi, а fallbackChunk детерминирован).
describe('chunkBook — без распознанных глав', () => {
  // Книга без заголовков вида "Глава N" — UI не должен ждать группировки,
  // все чанки идут с chapter: null (плоский список, не ошибка).
  test('returns chapter: null for every chunk when no headings are found', async () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Абзац номер ${i + 1} обычного текста книги без глав.`)
    const chunks = await chunkBook(paragraphs.join('\n\n'), { useAi: false, targetWords: 100 })

    assert.ok(chunks.length > 0)
    for (const chunk of chunks) assert.equal(chunk.chapter, null)
  })

  test('groups paragraphs up to roughly targetWords per chunk', async () => {
    // 12 слов на абзац — targetWords=30 должен группировать по ~2 абзаца на чанк.
    const paragraphs = Array.from({ length: 6 }, () => 'слово '.repeat(12).trim())
    const chunks = await chunkBook(paragraphs.join('\n\n'), { useAi: false, targetWords: 30 })

    assert.ok(chunks.length >= 2 && chunks.length < 6, `ожидали группировку, получили ${chunks.length} чанков`)
  })
})

describe('chunkBook — с распознанными главами', () => {
  // Базовый случай распознавания глав — каждый чанк должен нести имя своей
  // главы, чтобы ридер мог группировать порции по главам в UI.
  test('splits into chapters on "Глава N" headings and tags each chunk', async () => {
    const text = [
      'Глава 1',
      'Текст первой главы, который должен попасть в чанк с chapter "Глава 1".',
      '',
      'Глава 2',
      'Текст второй главы, который должен попасть в чанк с chapter "Глава 2".',
    ].join('\n\n')

    const chunks = await chunkBook(text, { useAi: false, targetWords: 100 })
    const chapters = [...new Set(chunks.map((c) => c.chapter))]

    assert.deepEqual(chapters.sort(), ['Глава 1', 'Глава 2'])
    assert.ok(chunks.every((c) => c.content.length > 0))
  })

  // Эвристика заголовков глав понимает не только "Глава N" — "Часть"/англ.
  // "Chapter" тоже должны сработать.
  test('recognizes "Часть"/"Chapter" heading variants', async () => {
    const text = ['Часть первая', 'Текст.', '', 'Chapter 2', 'Text.'].join('\n\n')
    const chunks = await chunkBook(text, { useAi: false, targetWords: 100 })
    const chapters = [...new Set(chunks.map((c) => c.chapter))]
    assert.deepEqual(chapters, ['Часть первая', 'Chapter 2'])
  })
})

// Регрессия: реальный баг — статья по ссылке (много коротких абзацев вперемешку
// с редкими длинными) при targetWords=40 дала порции от 2 до 521 слова,
// в среднем 95.5 — фолбэк-группировка сама по себе не режет чанк, если
// один "абзац" уже длиннее цели, и не имеет верхней границы.
describe('chunkBook — довод размера порции к targetWords (renormalizeToTargetWords)', () => {
  test('caps a single oversized paragraph and merges tiny fragments toward targetWords', async () => {
    const targetWords = 40
    const paragraphs = [
      // Один длинный "абзац" без внутренних пустых строк — как лид секции статьи.
      Array.from({ length: 20 }, (_, i) => `Предложение номер ${i + 1} про читаемый контент.`).join(' '),
      // Несколько очень коротких фрагментов подряд — как список/подписи.
      'Короткий пункт раз.',
      'Короткий пункт два.',
      'Короткий пункт три.',
    ]

    const chunks = await chunkBook(paragraphs.join('\n\n'), { useAi: false, targetWords })
    const counts = chunks.map((c) => c.content.split(/\s+/).filter(Boolean).length)

    assert.ok(
      counts.every((n) => n <= targetWords * 2),
      `ни одна порция не должна намного превышать ориентир: ${counts}`,
    )
    // Три коротких пункта (по 3 слова) должны были склеиться друг с другом,
    // а не остаться тремя отдельными микро-порциями.
    assert.ok(chunks.length < paragraphs.length, `короткие фрагменты должны были склеиться: ${counts}`)
  })
})

describe('chunkBook — жёсткий лимит длины под Telegram', () => {
  test('splits a single paragraph far longer than the Telegram limit', async () => {
    // enforceMaxChars режет по ~3500 символов — абзац на ~7000 обязан разбиться.
    const longParagraph = 'Предложение книги. '.repeat(400)
    const chunks = await chunkBook(longParagraph, { useAi: false, targetWords: 100 })

    assert.ok(chunks.length > 1, 'длинный абзац должен был разбиться на несколько частей')
    for (const chunk of chunks) assert.ok(chunk.content.length <= 3500)
  })
})
