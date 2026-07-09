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
  }
  lockCount++
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    window.scrollTo(0, savedScrollY)
  }
}

export function useBodyScrollLock(openGetter) {
  watch(openGetter, (isOpen) => {
    if (isOpen) lock()
    else unlock()
  })
}
