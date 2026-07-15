import { getAuthHeaders } from './telegramUser.js'

async function parseOrThrow(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Запрос завершился с ошибкой ${res.status}`)
  }
  return res.json()
}

function buildHeaders(extra = {}) {
  return { ...extra, ...getAuthHeaders() }
}

export async function addBook({
  title,
  text,
  url,
  notificationsPerDay,
  timezone,
  targetWords,
}) {
  const res = await fetch('/api/books/add', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      title,
      text,
      url,
      notificationsPerDay,
      timezone,
      targetWords,
    }),
  })
  return parseOrThrow(res)
}

export async function listBooks() {
  const res = await fetch('/api/books/list', {
    headers: buildHeaders(),
  })
  return parseOrThrow(res)
}

export async function deleteBook(bookId) {
  const res = await fetch(`/api/books/${bookId}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })
  return parseOrThrow(res)
}

export async function updateBookTitle(bookId, title) {
  const res = await fetch(`/api/books/${bookId}`, {
    method: 'PATCH',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  return parseOrThrow(res)
}

export async function getBookChunks(bookId) {
  const res = await fetch(`/api/books/${bookId}/chunks`, {
    headers: buildHeaders(),
  })
  return parseOrThrow(res)
}

export async function updateDeliveryFrequency(bookId, notificationsPerDay) {
  const res = await fetch(`/api/books/${bookId}/delivery`, {
    method: 'PATCH',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ notificationsPerDay }),
  })
  return parseOrThrow(res)
}

export async function updateDeliveryActive(bookId, isActive) {
  const res = await fetch(`/api/books/${bookId}/delivery`, {
    method: 'PATCH',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ isActive }),
  })
  return parseOrThrow(res)
}

export async function updateChunkSize(bookId, targetWords) {
  const res = await fetch(`/api/books/${bookId}/chunk-size`, {
    method: 'PATCH',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ targetWords }),
  })
  return parseOrThrow(res)
}

export async function deliverNow(bookId) {
  const res = await fetch(`/api/books/${bookId}/deliver-now`, {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })
  return parseOrThrow(res)
}

export async function resetProgress(bookId) {
  const res = await fetch(`/api/books/${bookId}/reset-progress`, {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })
  return parseOrThrow(res)
}

export async function addAdmin(username) {
  const res = await fetch('/api/admins', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username }),
  })
  return parseOrThrow(res)
}

export async function removeAdmin(targetTelegramId) {
  const res = await fetch('/api/admins', {
    method: 'DELETE',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ targetTelegramId }),
  })
  return parseOrThrow(res)
}

export async function sendFeedback({ message }) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message }),
  })
  return parseOrThrow(res)
}

export async function getBillingStatus() {
  const res = await fetch('/api/billing/status', {
    headers: buildHeaders(),
  })
  return parseOrThrow(res)
}

export async function createProInvoice() {
  const res = await fetch('/api/billing/invoice', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })
  return parseOrThrow(res)
}

export async function listGrantedProUsers() {
  const res = await fetch('/api/billing/grants', {
    headers: buildHeaders(),
  })
  return parseOrThrow(res)
}

export async function grantProByUsername(username) {
  const res = await fetch('/api/billing/grants', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username }),
  })
  return parseOrThrow(res)
}

export async function revokePro(targetTelegramId) {
  const res = await fetch('/api/billing/grants', {
    method: 'DELETE',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ targetTelegramId }),
  })
  return parseOrThrow(res)
}
