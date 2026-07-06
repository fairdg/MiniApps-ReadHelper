// Windows/старый Mac используют \r\n или \r как разрыв строки — а дробление
// текста (chunking.js) ищет границы абзацев по "\n{2,}", что не сработает,
// если между строками затесался \r. Приводим всё к простому \n.
function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// Убирает картинки из вставленного/загруженного текста — markdown ![alt](url)
// и HTML <img>. В сообщении Telegram картинка всё равно превратилась бы в
// нечитаемую ссылку/тег, так что чище просто вырезать её при добавлении книги.
export function stripImages(text) {
  return normalizeLineEndings(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const NULL_BYTE = String.fromCharCode(0)
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd)

// Грубая проверка, что файл вообще похож на текст — иначе в Telegram уйдёт
// нечитаемая каша. Ловит два частых случая: бинарный файл, ошибочно
// загруженный как текст (нулевые байты), и текст в кодировке, отличной от
// UTF-8 (много символов-заменителей после неправильного декодирования).
export function assertReadableText(text) {
  if (text.includes(NULL_BYTE)) {
    throw new Error(
      'Файл не похож на текст — возможно, это бинарный формат (PDF/DOCX и т.п. пока не поддерживаются)',
    )
  }

  const replacementCount = text.split(REPLACEMENT_CHAR).length - 1
  if (text.length > 0 && replacementCount / text.length > 0.02) {
    throw new Error('Не удалось прочитать текст — похоже, кодировка файла не UTF-8')
  }
}
