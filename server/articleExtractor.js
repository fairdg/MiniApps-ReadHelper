import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

// Достаёт основной текст статьи со страницы (без навигации/рекламы/подвала) —
// тот же алгоритм, что использует "режим чтения" в Firefox.
export async function extractArticle(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReadHelperBot/1.0)' },
  })

  if (!res.ok) {
    throw new Error(`Не удалось загрузить страницу: ${res.status}`)
  }

  const html = await res.text()
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
