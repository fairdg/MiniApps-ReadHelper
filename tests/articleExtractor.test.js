import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { detectCharset, decodeHtml } from '../server/articleExtractor.js'

function utf8Bytes(str) {
  return new TextEncoder().encode(str)
}

describe('detectCharset', () => {
  // Основной путь — сайт нормально объявляет кодировку в HTTP-заголовке.
  test('reads charset from the Content-Type header when present', () => {
    assert.equal(detectCharset('text/html; charset=windows-1251', utf8Bytes('')), 'windows-1251')
  })

  // Заголовок HTTP авторитетнее содержимого страницы — не должны
  // "подсматривать" в meta, если ответ уже сказал, что тут UTF-8.
  test('header charset wins even if a different one is in a meta tag', () => {
    const head = utf8Bytes('<html><head><meta charset="koi8-r"></head>')
    assert.equal(detectCharset('text/html; charset=utf-8', head), 'utf-8')
  })

  // Ровно та ситуация, что вызвала реальный баг: заголовок без charset,
  // кодировка объявлена только внутри HTML.
  test('falls back to <meta charset="..."> when the header has none', () => {
    const head = utf8Bytes('<html><head><meta charset="windows-1251"><title>x</title>')
    assert.equal(detectCharset('text/html', head), 'windows-1251')
  })

  // Старый способ объявления кодировки (до HTML5 <meta charset>) — тоже
  // должен распознаваться.
  test('falls back to <meta http-equiv content="...charset=..."> form', () => {
    const head = utf8Bytes('<html><head><meta http-equiv="Content-Type" content="text/html; charset=koi8-r">')
    assert.equal(detectCharset('text/html', head), 'koi8-r')
  })

  // Кодировка нигде не объявлена явно — безопасный дефолт UTF-8.
  test('defaults to utf-8 when nothing declares a charset anywhere', () => {
    const head = utf8Bytes('<html><head><title>No charset here</title></head>')
    assert.equal(detectCharset('text/html', head), 'utf-8')
  })

  // Ответ вообще без Content-Type — не должно падать, тот же дефолт UTF-8.
  test('defaults to utf-8 when there is no Content-Type header at all', () => {
    assert.equal(detectCharset(null, utf8Bytes('<html></html>')), 'utf-8')
  })
})

describe('decodeHtml — регрессия реального бага (страница без charset в заголовке)', () => {
  // Реальный баг: fetch().text() всегда декодирует как UTF-8, если сайт
  // объявляет кодировку только через <meta charset>, а не в HTTP-заголовке —
  // получалась каша из символов-заменителей, и книга по ссылке падала на
  // проверке читаемости текста.
  test('picks up meta charset when the header has none (ASCII content, mechanics only)', () => {
    // ASCII-only тело — тут проверяется только сама механика (выбор charset
    // без заголовка), не байты не-ASCII символов. Реальную не-ASCII
    // windows-1251/koi8-r расшифровку проверяют два теста ниже через
    // сгенерированные бинарные фикстуры (TextEncoder умеет кодировать
    // только в UTF-8, поэтому вручную такие байты в JS не собрать).
    const html = '<html><head><meta charset="windows-1251"></head><body><p>text</p></body></html>'
    const buffer = utf8Bytes(html)
    const decoded = decodeHtml(buffer, 'text/html')
    assert.equal(decoded.includes('�'), false)
    assert.match(decoded, /text/)
  })

  // Опечатка/выдуманная кодировка в meta — TextDecoder бросит исключение на
  // неизвестном label; лучше молча откатиться на UTF-8, чем упасть целиком.
  test('falls back to utf-8 decoding when the declared charset is unsupported/unknown', () => {
    const html = '<html><head><meta charset="not-a-real-charset"></head><body><p>ok</p></body></html>'
    const buffer = utf8Bytes(html)
    const decoded = decodeHtml(buffer, 'text/html')
    assert.match(decoded, /ok/)
  })

  test('decodes real windows-1251 bytes correctly when only declared via meta tag', () => {
    // Байты сгенерированы отдельно (python codecs, windows-1251) — тут просто
    // читаем уже готовый бинарник, ничего не кодируем в JS (TextEncoder умеет
    // только UTF-8).
    const buffer = readFixture('win1251_meta.bin')
    const decoded = decodeHtml(buffer, 'text/html')
    assert.equal(decoded.includes('�'), false)
    assert.match(decoded, /Тестовая строка/)
  })

  test('decodes real koi8-r bytes declared via meta http-equiv', () => {
    const buffer = readFixture('koi8_meta.bin')
    const decoded = decodeHtml(buffer, 'text/html')
    assert.equal(decoded.includes('�'), false)
    assert.match(decoded, /Тестовая строка/)
  })
})

// Бинарные фикстуры для не-ASCII кодировок сгенерированы один раз через
// python3 (codecs умеет windows-1251/koi8-r "на запись", в отличие от
// встроенного в JS TextEncoder, который кодирует только в UTF-8) и лежат
// рядом с тестами как маленькие бинарники — не текстовые файлы, поэтому не
// в этом .test.js напрямую.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readFixture(name) {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  return new Uint8Array(readFileSync(path))
}
