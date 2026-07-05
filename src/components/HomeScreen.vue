<script setup>
import { ref, onMounted } from 'vue'
import { listBooks } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'
import AddBookSheet from './AddBookSheet.vue'

const emit = defineEmits(['open-text'])

const books = ref([])
const loading = ref(true)
const error = ref('')
const addSheetOpen = ref(false)

function bookMeta(book) {
  if (book.status === 'processing') return 'Обрабатывается…'
  if (book.status === 'failed') return 'Не удалось обработать текст'
  if (!book.total_chunks) return 'Нет порций'
  return `${book.read_chunks}/${book.total_chunks} порций прочитано`
}

function bookProgress(book) {
  if (!book.total_chunks) return 0
  return Math.round((book.read_chunks / book.total_chunks) * 100)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { telegramId } = getTelegramUser()
    const { books: fetched } = await listBooks(telegramId)
    books.value = fetched
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function openAddSheet() {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light')
  addSheetOpen.value = true
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <h1>ReadHelper</h1>
      <button class="icon-btn" aria-label="Добавить" @click="openAddSheet">+</button>
    </header>

    <div class="search-wrap">
      <input type="text" placeholder="Поиск по текстам..." class="search-input" />
    </div>

    <p v-if="loading" class="state-message">Загружаю…</p>
    <p v-else-if="error" class="state-message error">{{ error }}</p>
    <p v-else-if="!books.length" class="state-message">
      Пока нет ни одной книги — нажми "+", чтобы добавить первую.
    </p>

    <ul v-else class="text-list">
      <li
        v-for="book in books"
        :key="book.id"
        class="text-item"
        @click="emit('open-text', book)"
      >
        <div class="text-item-icon">📄</div>
        <div class="text-item-body">
          <div class="text-item-title">{{ book.title }}</div>
          <div class="text-item-meta">{{ bookMeta(book) }}</div>
        </div>
        <div class="text-item-progress">
          <div class="progress-bar"><span :style="{ width: bookProgress(book) + '%' }" /></div>
        </div>
      </li>
    </ul>

    <AddBookSheet :open="addSheetOpen" @close="addSheetOpen = false" @added="load" />
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 24px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 5;
}

.topbar h1 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  text-align: center;
}

.icon-btn {
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.search-wrap {
  padding: 0 16px 12px;
}

.search-input {
  width: 100%;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 15px;
}

.search-input::placeholder {
  color: var(--hint);
}

.state-message {
  padding: 24px 16px;
  text-align: center;
  color: var(--hint);
  font-size: 14px;
}

.state-message.error {
  color: #e5484d;
}

.text-list {
  list-style: none;
  margin: 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.text-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--secondary-bg);
  padding: 12px 14px;
  border-radius: 14px;
  cursor: pointer;
}

.text-item-icon {
  font-size: 22px;
  width: 36px;
  text-align: center;
}

.text-item-body {
  flex: 1;
  min-width: 0;
}

.text-item-title {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-item-meta {
  font-size: 12px;
  color: var(--hint);
  margin-top: 2px;
}

.text-item-progress {
  width: 44px;
}

.progress-bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.progress-bar span {
  display: block;
  height: 100%;
  background: var(--button);
  border-radius: 2px;
}
</style>
