import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { stripImages, normalizeBookText, assertReadableText } from '../server/textClean.js'

describe('stripImages', () => {
  test('removes markdown and html images, keeps text', () => {
    const input = 'Before ![alt](http://x.test/a.png) middle <img src="b.png"> after'
    const result = stripImages(input)
    assert.equal(result.includes('!['), false)
    assert.equal(result.includes('<img'), false)
    assert.match(result, /Before/)
    assert.match(result, /middle/)
    assert.match(result, /after/)
  })

  test('normalizes CRLF/CR line endings to LF', () => {
    const result = stripImages('one\r\ntwo\rthree')
    assert.equal(result.includes('\r'), false)
  })
})

describe('normalizeBookText — переносы по ширине страницы', () => {
  test('joins hyphenated word split across a line wrap', () => {
    const input = 'Слово перене-\nсено через дефис на стыке строк.'
    const result = normalizeBookText(input)
    assert.match(result, /перенесено/)
    assert.equal(result.includes('-\n'), false)
  })

  test('reflows a hard-wrapped paragraph into one line, keeps real paragraph breaks', () => {
    const input = ['Первая строка абзаца,', 'вторая строка того же абзаца.', '', 'Второй абзац отдельно.'].join('\n')
    const result = normalizeBookText(input)
    assert.equal(result, 'Первая строка абзаца, вторая строка того же абзаца.\n\nВторой абзац отдельно.')
  })

  test('drops a page number alone on its own line', () => {
    const input = ['Текст главы.', '42', 'Продолжение текста.'].join('\n')
    const result = normalizeBookText(input)
    assert.equal(result.includes('42'), false)
    assert.match(result, /Текст главы\. Продолжение текста\./)
  })
})

describe('normalizeBookText — титульный лист/выходные данные', () => {
  test('strips front matter block containing ISBN near the start, keeps real content after it', () => {
    const input = [
      'Эту книгу хорошо дополняют:',
      '',
      'Пример рекомендации',
      '',
      'Иванов, Иван',
      'И20    Название примера / Иван Иванов. — М. :',
      '    Издательство, 2020. — 100 с.',
      '    ISBN 978-5-00000-000-0',
      ' УДК 000.000',
      'ББК 00.0',
      '',
      'Глава 1',
      '',
      'Это настоящий текст первой главы, который должен сохраниться.',
    ].join('\n')

    const result = normalizeBookText(input)
    assert.equal(result.includes('Эту книгу хорошо дополняют'), false)
    assert.equal(result.includes('ISBN'), false)
    assert.match(result, /Глава 1/)
    assert.match(result, /Это настоящий текст первой главы/)
  })

  test('strips copyright block marked only by © / "Все права защищены"', () => {
    const input = ['Все права защищены. © 2020', '', 'Введение', '', 'Настоящий текст введения.'].join('\n')
    const result = normalizeBookText(input)
    assert.equal(result.includes('Все права защищены'), false)
    assert.match(result, /Настоящий текст введения/)
  })

  // Регрессия: реальный баг — статья со ссылкой на Wikipedia (247 КБ) с
  // 86 упоминаниями ISBN в разделе "Литература" почти в конце текста
  // обрезалась до ~200 байт, т.к. stripFrontMatter резал всё до ПОСЛЕДНЕГО
  // совпадения по всему документу. Маркер вне зоны поиска (после
  // FRONT_MATTER_SEARCH_CHARS) не должен ничего вырезать.
  test('does NOT strip content when ISBN appears far into a long document (regression)', () => {
    const introParagraph = 'Это настоящий вводный абзац книги, который должен остаться на месте без изменений.'
    // Достаточно абзацев, чтобы суммарная длина заведомо превысила окно поиска
    // (FRONT_MATTER_SEARCH_CHARS = 6000) до появления маркера — иначе тест
    // ничего не проверяет: сам реальный баг был именно про текст ЗА окном.
    const filler = Array.from(
      { length: 80 },
      (_, i) => `Обычный абзац номер ${i + 1} основного текста книги, без каких-либо служебных маркеров внутри.`,
    ).join('\n\n')
    assert.ok(introParagraph.length + filler.length > 6000, 'тестовый filler короче окна поиска')
    const farAwayCitation = 'В библиографии упоминается издание с ISBN 978-5-00000-000-0 среди прочих источников.'

    const input = [introParagraph, filler, farAwayCitation].join('\n\n')
    const result = normalizeBookText(input)

    assert.match(result, /Это настоящий вводный абзац книги/)
    assert.match(result, /Обычный абзац номер 1 основного текста/)
    assert.match(result, /Обычный абзац номер 40 основного текста/)
  })
})

describe('normalizeBookText — оглавление', () => {
  test('strips a table of contents block with dot leaders, keeps a same-titled chapter body later', () => {
    const input = [
      'Содержание',
      '',
      'Введение . . . . . . . . . . . . . . . . . . . . . . . . . . . 12',
      'Раздел первый: как всё начиналось . . . . . . . . . . . . . . . 20',
      '',
      'Введение',
      '',
      'Это настоящий текст введения, который должен остаться на месте без изменений.',
    ].join('\n')

    const result = normalizeBookText(input)
    assert.equal(result.includes('Содержание'), false)
    assert.equal(/\d{1,4}\s*$/m.test(result.split('\n\n')[0] ?? ''), false)
    assert.match(result, /Это настоящий текст введения/)
  })

  test('strips one-entry-per-paragraph TOC lines (single dot-leader run, high density)', () => {
    const input = [
      'Приложения . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 330',
      '',
      'Введение . . . . . . . . . . . . . . . . . . . . . . . . . . . 12',
      '',
      'Введение',
      '',
      'Это настоящий текст введения книги, который не должен быть вырезан.',
    ].join('\n')

    const result = normalizeBookText(input)
    assert.equal(result.includes('Приложения'), false)
    assert.match(result, /Это настоящий текст введения книги/)
  })

  test('strips a TOC without dot leaders, just "title    pagenum" lines under a heading', () => {
    const input = [
      'Содержание',
      '',
      'Введение     5',
      'Раздел первый: как всё начиналось     12',
      'Раздел второй     34',
      '',
      'Введение',
      '',
      'Настоящий текст введения, который должен остаться на месте без изменений.',
    ].join('\n')

    const result = normalizeBookText(input)
    assert.equal(result.includes('Раздел первый: как всё начиналось     12'), false)
    assert.match(result, /Настоящий текст введения/)
  })

  // Регрессия: список литературы/сносок с числами (годы, страницы) в конце
  // длинного документа не должен приниматься за оглавление.
  test('does NOT strip a references-like block far into a long document (regression)', () => {
    const filler = Array.from(
      { length: 100 },
      (_, i) => `Обычный абзац номер ${i + 1} основного текста книги, без служебных маркеров внутри.`,
    ).join('\n\n')
    assert.ok(filler.length > 6000, 'тестовый filler короче окна поиска')
    const farAwayReferences = [
      'Иванов И. И. Книга первая, 2005',
      'Петров П. П. Книга вторая, 2010',
      'Сидоров С. С. Книга третья, 2015',
    ].join('\n')

    const input = [filler, farAwayReferences].join('\n\n')
    const result = normalizeBookText(input)

    assert.match(result, /Обычный абзац номер 1 основного текста/)
    assert.match(result, /Иванов И\. И\. Книга первая, 2005/)
  })
})

describe('assertReadableText', () => {
  test('throws on null bytes (binary file mistaken for text)', () => {
    assert.throws(() => assertReadableText('some\x00text'), /бинарный формат/)
  })

  test('throws when replacement characters dominate (wrong encoding)', () => {
    const garbled = '�'.repeat(50) + 'ok'
    assert.throws(() => assertReadableText(garbled), /кодировка/)
  })

  test('passes on normal readable text', () => {
    assert.doesNotThrow(() => assertReadableText('Обычный читаемый текст без проблем.'))
  })

  test('tolerates a tiny fraction of replacement characters', () => {
    const mostlyFine = 'Нормальный текст. '.repeat(50) + '�'
    assert.doesNotThrow(() => assertReadableText(mostlyFine))
  })
})
