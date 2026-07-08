import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

// fetch().text() всегда декодирует тело как UTF-8, если кодировка не указана
// в HTTP-заголовке Content-Type — а многие сайты (особенно старые
// русскоязычные, на windows-1251/koi8-r) объявляют её только через
// <meta charset> внутри самого HTML. В этом случае получалась "каша" из
// символов-заменителей, и книга по ссылке не проходила проверку на читаемый
// текст. Поэтому декодируем сами: сначала смотрим заголовок, если там нет —
// заглядываем в начало байтов (meta-тег всегда в первых байтах документа).
function detectCharset(contentTypeHeader, headBytes) {
  const headerMatch = /charset=([^;]+)/i.exec(contentTypeHeader ?? '')
  if (headerMatch) return headerMatch[1].trim().toLowerCase()

  // Метатеги — чистый ASCII, latin1 тут просто читает байты как есть.
  const head = Buffer.from(headBytes).toString('latin1')
  const metaMatch =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ??
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)
  return metaMatch ? metaMatch[1].toLowerCase() : 'utf-8'
}

function decodeHtml(buffer, contentTypeHeader) {
  const charset = detectCharset(contentTypeHeader, buffer.slice(0, 2048))
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    // Незнакомая/неверно опознанная кодировка — лучше UTF-8 с потерями,
    // чем упасть на "не удалось прочитать текст" из-за одной надписи в meta.
    return new TextDecoder('utf-8').decode(buffer)
  }
}

// Достаёт основной текст статьи со страницы (без навигации/рекламы/подвала) —
// тот же алгоритм, что использует "режим чтения" в Firefox.
export async function extractArticle(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReadHelperBot/1.0)' },
  })

  if (!res.ok) {
    throw new Error(`Не удалось загрузить страницу: ${res.status}`)
  }

  const buffer = new Uint8Array(await res.arrayBuffer())
  const html = decodeHtml(buffer, res.headers.get('content-type'))
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()

  if (!article?.textContent?.trim()) {
    throw new Error('Не удалось извлечь текст статьи со страницы')
  }

  return {
    title: article.title?.trim() || null,
    text: article.textContent.trim(),
  }
}
