// В Telegram WebView нативный window.confirm может быть недоступен/выглядит
// чужеродно — используем showConfirm из Bot API, если он есть, иначе фолбэк
// на обычный confirm (для локальной разработки вне Telegram).
export function confirmDialog(message) {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp
    if (tg?.showConfirm) {
      tg.showConfirm(message, (ok) => resolve(ok))
    } else {
      resolve(window.confirm(message))
    }
  })
}
