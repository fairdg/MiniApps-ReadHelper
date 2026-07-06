async function parseOrThrow(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Запрос завершился с ошибкой ${res.status}`)
  }
  return res.json()
}

export async function addBook({
  telegramId,
  username,
  title,
  text,
  url,
  notificationsPerDay,
  timezone,
}) {
  const res = await fetch('/api/books/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, username, title, text, url, notificationsPerDay, timezone }),
  })
  return parseOrThrow(res)
}

export async function listBooks(telegramId) {
  const res = await fetch(`/api/books/list?telegramId=${telegramId}`)
  return parseOrThrow(res)
}

export async function deleteBook(bookId, telegramId) {
  const res = await fetch(`/api/books/${bookId}?telegramId=${telegramId}`, {
    method: 'DELETE',
  })
  return parseOrThrow(res)
}

export async function getBookChunks(bookId, telegramId) {
  const res = await fetch(`/api/books/${bookId}/chunks?telegramId=${telegramId}`)
  return parseOrThrow(res)
}

export async function updateDeliveryFrequency(bookId, telegramId, notificationsPerDay) {
  const res = await fetch(`/api/books/${bookId}/delivery`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, notificationsPerDay }),
  })
  return parseOrThrow(res)
}

export async function updateDeliveryActive(bookId, telegramId, isActive) {
  const res = await fetch(`/api/books/${bookId}/delivery`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, isActive }),
  })
  return parseOrThrow(res)
}

export async function deliverNow(bookId, telegramId) {
  const res = await fetch(`/api/books/${bookId}/deliver-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId }),
  })
  return parseOrThrow(res)
}

export async function sendFeedback({ telegramId, username, message }) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, username, message }),
  })
  return parseOrThrow(res)
}
