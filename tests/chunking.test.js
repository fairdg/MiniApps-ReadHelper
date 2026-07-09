import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { chunkBook, clampTargetWords, MIN_TARGET_WORDS, MAX_TARGET_WORDS } from '../server/chunking.js'

describe('clampTargetWords', () => {
  test('clamps below the minimum', () => {
    assert.equal(clampTargetWords(1), MIN_TARGET_WORDS)
  })

  test('clamps above the maximum', () => {
    assert.equal(clampTargetWords(10000), MAX_TARGET_WORDS)
  })

  test('passes through a value already in range', () => {
    assert.equal(clampTargetWords(150), 150)
  })

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

  test('recognizes "Часть"/"Chapter" heading variants', async () => {
    const text = ['Часть первая', 'Текст.', '', 'Chapter 2', 'Text.'].join('\n\n')
    const chunks = await chunkBook(text, { useAi: false, targetWords: 100 })
    const chapters = [...new Set(chunks.map((c) => c.chapter))]
    assert.deepEqual(chapters, ['Часть первая', 'Chapter 2'])
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
