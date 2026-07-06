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

// Текст, скопированный из PDF/скана книги, приходит "жёстко" перенесённым по
// ширине страницы — каждая визуальная строка кончается своим \n, а не только
// настоящие абзацы. Из-за этого дробление (которое режет по пустой строке)
// принимает каждую строку страницы за отдельный абзац, и в Telegram улетают
// рваные куски с "случайными" пробелами вместо связного текста.
function reflowWrappedLines(text) {
  return text
    .split(/\n{2,}/)
    .map((block) =>
      block
        // Слово, перенесённое по слогам на стыке строк ("опусто-\nшить" → "опустошить").
        .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
        // Строка сама по себе — просто номер страницы: не часть текста.
        .split('\n')
        .filter((line) => !/^\s*\d{1,4}\s*$/.test(line))
        .join('\n')
        // Остальные переносы внутри абзаца — перенос по ширине страницы, не
        // конец абзаца: склеиваем обратно в связный текст через пробел.
        .replace(/\s*\n\s*/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n')
}

// Титульный/выходные данные книги (аннотация "с этой книгой также читают",
// титульный лист, копирайт-страница с УДК/ББК/ISBN) — не часть текста, который
// хочется получать порциями. Такая страница почти всегда идёт единым блоком и
// надёжно опознаётся по библиотечным индексам УДК/ББК или ISBN — до конца
// этого блока (включительно) просто отрезаем всё как обложку/выходные данные.
const IMPRINT_MARKER_RE = /\b(УДК|ББК|ISBN)\b/i

function stripFrontMatter(text) {
  const blocks = text.split(/\n{2,}/)
  let imprintIndex = -1

  for (let i = 0; i < blocks.length; i++) {
    if (IMPRINT_MARKER_RE.test(blocks[i])) imprintIndex = i
  }

  if (imprintIndex === -1) return text
  return blocks
    .slice(imprintIndex + 1)
    .join('\n\n')
    .trim()
}

// Полная нормализация текста перед сохранением/дроблением: приводит переносы
// строк, вырезает картинки, убирает титульный лист/выходные данные (если
// опознаны) и переносы по ширине страницы.
export function normalizeBookText(text) {
  const withoutImages = stripImages(text)
  const withoutFrontMatter = stripFrontMatter(withoutImages)
  return reflowWrappedLines(withoutFrontMatter)
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
