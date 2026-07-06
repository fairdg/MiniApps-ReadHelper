// Тап вне поля ввода/textarea убирает фокус — иначе на мобильных клавиатура
// остаётся открытой, пока не тапнешь конкретно по другому полю.
export function blurOnOutsideTap(event) {
  const tag = event.target.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
    document.activeElement?.blur()
  }
}
