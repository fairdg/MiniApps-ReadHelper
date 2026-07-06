const KEY = 'readhelper_dev_mode'

export function isDevMode() {
  return localStorage.getItem(KEY) === '1'
}

export function setDevMode(value) {
  localStorage.setItem(KEY, value ? '1' : '0')
}
