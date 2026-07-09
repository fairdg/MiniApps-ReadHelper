import { watch } from 'vue'

// Пока открыт bottom sheet (position: fixed) и в нём фокусируется поле
// ввода, мобильный браузер/WebView пытается проскроллить документ, чтобы
// поднять поле над клавиатурой — из-за фиксированного позиционирования сама
// модалка при этом дёргано подпрыгивает. Фикс: на время открытия убираем у
// body возможность скроллиться вообще (position: fixed + сохранённый scrollY),
// тогда браузеру нечего скроллить, и клавиатура просто сжимает видимую
// область без рывка. lockCount — на случай, если открыто несколько sheet'ов
// одновременно (например, настройки поверх которых открылась обратная связь).
let lockCount = 0
let savedScrollY = 0

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.width = '100%'
    // <html> тоже может проскроллиться независимо от body в некоторых
    // WebView — блокируем и его, иначе шторка всё равно может дёрнуться,
    // даже когда body уже зафиксирован.
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.height = '100%'
  }
  lockCount++
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.height = ''
    window.scrollTo(0, savedScrollY)
  }
}

export function useBodyScrollLock(openGetter) {
  watch(openGetter, (isOpen) => {
    if (isOpen) lock()
    else unlock()
  })
}
