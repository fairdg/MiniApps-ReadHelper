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
//
// Важно: ISBN/© могут законно встретиться где угодно в тексте (список
// литературы, сноски, ссылка на другую книгу в статье с Wikipedia) — это не
// значит, что до этого места всё "не текст". Поэтому ищем маркер только среди
// компактных абзацев (настоящий титульный блок короткий) и только в начале
// текста (front matter — по определению самое начало, не середина/конец).
const IMPRINT_MARKER_RE = /\b(УДК|ББК|ISBN)\b|©|все права защищены|all rights reserved/i
const FRONT_MATTER_SEARCH_CHARS = 6000
const MAX_FRONT_MATTER_BLOCK_CHARS = 1000

function stripFrontMatter(text) {
  const blocks = text.split(/\n{2,}/)
  let imprintIndex = -1
  let charsSeen = 0

  for (let i = 0; i < blocks.length && charsSeen <= FRONT_MATTER_SEARCH_CHARS; i++) {
    if (blocks[i].length <= MAX_FRONT_MATTER_BLOCK_CHARS && IMPRINT_MARKER_RE.test(blocks[i])) {
      imprintIndex = i
    }
    charsSeen += blocks[i].length + 2
  }

  if (imprintIndex === -1) return text
  return blocks
    .slice(imprintIndex + 1)
    .join('\n\n')
    .trim()
}

// Оглавление встречается в двух формах: с "точками-лидерами" между
// названием и номером страницы (". . . . . 128") — узор, которого не бывает
// в обычной прозе — или просто как список строк, где почти каждая кончается
// номером страницы (табы/пробелы вместо точек). Оба узора ловим по одному
// абзацу (оглавление обычно идёт сплошным блоком без пустых строк внутри), а
// заодно вырезаем сам заголовок "Оглавление"/"Содержание", даже если после
// него список отформатирован не настолько явно.
const DOT_LEADER_RE = /(?:\.\s?){4,}/g
const TOC_HEADING_RE = /^(оглавление|содержание|table of contents|contents)$/i
const ENDS_WITH_PAGE_NUMBER_RE = /\d{1,4}\s*$/

function looksLikeTableOfContents(block) {
  const dotLeaders = block.match(DOT_LEADER_RE)
  if (dotLeaders) {
    // Несколько прогонов точек в одном абзаце — точно оглавление одним блоком.
    // Один прогон тоже считается, если он и есть большая часть абзаца: так
    // выглядит одна строка оглавления ("Введение . . . . . . 12"), когда
    // каждый пункт — отдельный абзац, а не общий список без пустых строк.
    const dotChars = dotLeaders.reduce((sum, match) => sum + match.length, 0)
    if (dotLeaders.length >= 2 || dotChars / block.length >= 0.3) return true
  }

  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 3) return false

  const endingInNumber = lines.filter((line) => ENDS_WITH_PAGE_NUMBER_RE.test(line)).length
  return endingInNumber / lines.length >= 0.6
}

// То же соображение, что и в stripFrontMatter: список литературы/сносок в
// середине или конце длинной статьи может случайно выглядеть как оглавление
// (короткие строки, заканчивающиеся числом — например, годом или страницей
// цитаты), но оглавление по смыслу бывает только в начале текста — дальше
// эвристику не применяем, чтобы не съесть реальный текст.
const TOC_SEARCH_CHARS = 6000

function stripTableOfContents(text) {
  const blocks = text.split(/\n{2,}/)
  let charsSeen = 0

  return blocks
    .filter((block) => {
      const withinSearchWindow = charsSeen <= TOC_SEARCH_CHARS
      charsSeen += block.length + 2
      if (!withinSearchWindow) return true
      return !(TOC_HEADING_RE.test(block.trim()) || looksLikeTableOfContents(block))
    })
    .join('\n\n')
}

// Полная нормализация текста перед сохранением/дроблением: приводит переносы
// строк, вырезает картинки, убирает титульный лист/выходные данные и
// оглавление (если опознаны), затем переносы по ширине страницы.
export function normalizeBookText(text) {
  const withoutImages = stripImages(text)
  const withoutFrontMatter = stripFrontMatter(withoutImages)
  const withoutToc = stripTableOfContents(withoutFrontMatter)
  return reflowWrappedLines(withoutToc)
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
