import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { stripImages, normalizeBookText, assertReadableText } from '../server/textClean.js'

describe('stripImages', () => {
  // markdown ![]() и <img> ушли бы в Telegram нечитаемым мусором — обе формы
  // должны вырезаться, а окружающий текст оставаться на месте.
  test('removes markdown and html images, keeps text', () => {
    const input = 'Before ![alt](http://x.test/a.png) middle <img src="b.png"> after'
    const result = stripImages(input)
    assert.equal(result.includes('!['), false)
    assert.equal(result.includes('<img'), false)
    assert.match(result, /Before/)
    assert.match(result, /middle/)
    assert.match(result, /after/)
  })

  // Дальше по пайплайну границы абзацев ищутся по "\n{2,}" — если затесался
  // \r (Windows/старый Mac), эта граница не сработает.
  test('normalizes CRLF/CR line endings to LF', () => {
    const result = stripImages('one\r\ntwo\rthree')
    assert.equal(result.includes('\r'), false)
  })
})

describe('normalizeBookText — переносы по ширине страницы', () => {
  // Текст из PDF/скана переносится по слогам на стыке строк ("перене-\nсено") —
  // дефис и разрыв строки нужно убрать, получив целое слово.
  test('joins hyphenated word split across a line wrap', () => {
    const input = 'Слово перене-\nсено через дефис на стыке строк.'
    const result = normalizeBookText(input)
    assert.match(result, /перенесено/)
    assert.equal(result.includes('-\n'), false)
  })

  // Перенос по ширине страницы (не настоящий конец абзаца) должен схлопнуться
  // в пробел, а реальная граница абзаца (пустая строка) — остаться как есть.
  test('reflows a hard-wrapped paragraph into one line, keeps real paragraph breaks', () => {
    const input = ['Первая строка абзаца,', 'вторая строка того же абзаца.', '', 'Второй абзац отдельно.'].join('\n')
    const result = normalizeBookText(input)
    assert.equal(result, 'Первая строка абзаца, вторая строка того же абзаца.\n\nВторой абзац отдельно.')
  })

  // Строка-одиночка из одних цифр — типичный номер страницы при копировании
  // из PDF, не часть текста; должна вырезаться, а соседний текст — склеиться.
  test('drops a page number alone on its own line', () => {
    const input = ['Текст главы.', '42', 'Продолжение текста.'].join('\n')
    const result = normalizeBookText(input)
    assert.equal(result.includes('42'), false)
    assert.match(result, /Текст главы\. Продолжение текста\./)
  })
})

describe('normalizeBookText — титульный лист/выходные данные', () => {
  // Классическая выходная страница книги (рекомендации + УДК/ББК/ISBN) идёт
  // единым блоком в начале — всё до конца этого блока должно вырезаться,
  // а первая настоящая глава после него — остаться нетронутой.
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

  // Не у каждой книги есть УДК/ISBN — маркером может быть и просто © или
  // фраза "Все права защищены", этого тоже достаточно, чтобы опознать блок.
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
  // Классическая форма оглавления: "Название . . . . 12" — точки-лидеры не
  // встречаются в обычной прозе, надёжный сигнал, что это список разделов,
  // а не текст. Реальная глава с тем же названием дальше должна уцелеть.
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

  // Регрессия: раньше требовалось 2+ прогона точек В ОДНОМ абзаце, но
  // некоторые книги оформляют оглавление так, что каждый пункт — свой
  // отдельный абзац (пустая строка между ними) — там прогон точек только один.
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

  // Не у всех оглавлений есть точки-лидеры — иногда просто пробелы/табы
  // перед номером страницы. Ловится по явному заголовку "Содержание" +
  // по тому, что почти все строки блока кончаются числом.
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
  // Нулевые байты — верный признак, что загрузили бинарный файл (PDF/DOCX),
  // а не текст: должно упасть с понятной ошибкой, а не улететь в Telegram кашей.
  test('throws on null bytes (binary file mistaken for text)', () => {
    assert.throws(() => assertReadableText('some\x00text'), /бинарный формат/)
  })

  // Много символов-заменителей подряд — значит файл прочитали не в той
  // кодировке (не UTF-8); тоже должно упасть с понятной ошибкой.
  test('throws when replacement characters dominate (wrong encoding)', () => {
    const garbled = '�'.repeat(50) + 'ok'
    assert.throws(() => assertReadableText(garbled), /кодировка/)
  })

  // Базовый happy path — обычный текст не должен спотыкаться ни об одну проверку.
  test('passes on normal readable text', () => {
    assert.doesNotThrow(() => assertReadableText('Обычный читаемый текст без проблем.'))
  })

  // Единичный символ-заменитель где-то в тексте — не повод браковать весь
  // файл (порог — 2% от длины), иначе ловили бы ложные срабатывания.
  test('tolerates a tiny fraction of replacement characters', () => {
    const mostlyFine = 'Нормальный текст. '.repeat(50) + '�'
    assert.doesNotThrow(() => assertReadableText(mostlyFine))
  })
})
