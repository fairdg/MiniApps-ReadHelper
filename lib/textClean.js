// Убирает картинки из вставленного/загруженного текста — markdown ![alt](url)
// и HTML <img>. В сообщении Telegram картинка всё равно превратилась бы в
// нечитаемую ссылку/тег, так что чище просто вырезать её при добавлении книги.
export function stripImages(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
