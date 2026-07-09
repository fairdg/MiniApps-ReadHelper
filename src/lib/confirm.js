// В Telegram WebView нативный window.confirm может быть недоступен/выглядит
// чужеродно — используем showConfirm из Bot API, если он есть, иначе фолбэк
// на обычный confirm (для локальной разработки вне Telegram).
//
// showConfirm появился в Bot API 6.2 — у пользователя со старым клиентом
// Telegram метод на объекте есть (SDK его всегда определяет), но нативная
// сторона не отвечает на вызов, и колбэк никогда не срабатывает. Без проверки
// версии и подстраховки по таймауту это вешало Promise навсегда: код после
// `await confirmDialog(...)` просто никогда не выполнялся, без единой ошибки.
const CONFIRM_TIMEOUT_MS = 4000

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp
    const supportsShowConfirm = tg?.showConfirm && (tg.isVersionAtLeast?.('6.2') ?? true)

    if (!supportsShowConfirm) {
      resolve(window.confirm(message))
      return
    }

    let settled = false
    const settle = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    // Если нативная сторона не поддерживает вызов и молчит — не виснем
    // навсегда, откатываемся на обычный confirm.
    const timeout = setTimeout(() => settle(window.confirm(message)), CONFIRM_TIMEOUT_MS)

    tg.showConfirm(message, (ok) => {
      clearTimeout(timeout)
      settle(ok)
    })
  })
}
