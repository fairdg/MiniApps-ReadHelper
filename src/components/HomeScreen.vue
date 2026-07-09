<script setup>
import { ref, computed, onMounted } from 'vue'
import { listBooks, deleteBook } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'
import { isDevMode, setDevMode, isOwner, checkAdmin } from '../lib/devMode.js'
import { confirmDialog } from '../lib/confirm.js'
import AddBookSheet from './AddBookSheet.vue'
import AppSettingsSheet from './AppSettingsSheet.vue'
import FeedbackSheet from './FeedbackSheet.vue'
import IconGear from './icons/IconGear.vue'
import IconDocument from './icons/IconDocument.vue'
import IconTrash from './icons/IconTrash.vue'

const emit = defineEmits(['open-text'])

const books = ref([])
const loading = ref(true)
const error = ref('')
const addSheetOpen = ref(false)
const appSettingsOpen = ref(false)
const feedbackOpen = ref(false)
const devMode = ref(isDevMode())
// Мгновенно по env (только для настоящего владельца), пока не пришёл ответ
// checkAdmin() — без этого шестерёнка/переключатель на миг мелькали бы для
// владельца после каждого открытия, ожидая сеть.
const admin = ref(isOwner(getTelegramUser().telegramId))
const owner = ref(isOwner(getTelegramUser().telegramId))
const activeTab = ref('inProgress') // 'inProgress' | 'done'

checkAdmin(getTelegramUser().telegramId).then((result) => {
  admin.value = result.isAdmin
  owner.value = result.isOwner
})

function isDone(book) {
  return book.total_chunks > 0 && book.read_chunks >= book.total_chunks
}

const booksInProgress = computed(() => books.value.filter((b) => !isDone(b)))
const booksDone = computed(() => books.value.filter(isDone))
const visibleBooks = computed(() =>
  activeTab.value === 'done' ? booksDone.value : booksInProgress.value,
)

function changeDevMode(value) {
  devMode.value = value
  setDevMode(value)
}

function bookMeta(book) {
  if (book.status === 'processing') return 'Обрабатывается…'
  if (book.status === 'failed') return 'Не удалось обработать текст'
  if (!book.total_chunks) return 'Нет порций'
  if (!book.delivery_active && book.read_chunks < book.total_chunks) return 'На паузе'
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

function openFeedback() {
  appSettingsOpen.value = false
  feedbackOpen.value = true
}

async function removeBook(book) {
  const ok = await confirmDialog(`Удалить книгу "${book.title}"? Это нельзя отменить.`)
  if (!ok) return

  try {
    const { telegramId } = getTelegramUser()
    await deleteBook(book.id, telegramId)
    // Убираем из уже загруженного списка на месте, а не через повторный
    // load() — иначе весь список на секунду пропадает и заменяется на
    // "Загружаю…", хотя данные для этого уже были на экране.
    books.value = books.value.filter((b) => b.id !== book.id)
  } catch (err) {
    error.value = err.message
  }
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'inProgress' }"
          @click="activeTab = 'inProgress'"
        >
          В процессе ({{ booksInProgress.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'done' }"
          @click="activeTab = 'done'"
        >
          Завершено ({{ booksDone.length }})
        </button>
      </div>
      <div class="header-actions">
        <button class="icon-btn" aria-label="Настройки" @click="appSettingsOpen = true">
          <IconGear />
        </button>
        <button class="icon-btn" aria-label="Добавить" @click="openAddSheet">+</button>
      </div>
    </header>

    <p v-if="loading" class="state-message">Загружаю…</p>
    <p v-else-if="error" class="state-message error">{{ error }}</p>
    <p v-else-if="!books.length" class="state-message">
      Пока нет ни одной книги — нажми "+", чтобы добавить первую.
    </p>

    <template v-else>
      <p v-if="!visibleBooks.length" class="state-message">
        {{ activeTab === 'done' ? 'Пока нет завершённых книг.' : 'Нет книг в процессе.' }}
      </p>

      <ul v-else class="text-list">
        <li
          v-for="book in visibleBooks"
          :key="book.id"
          class="text-item"
          @click="emit('open-text', book)"
        >
          <div class="text-item-icon"><IconDocument /></div>
          <div class="text-item-body">
            <div class="text-item-title">{{ book.title }}</div>
            <div class="text-item-meta">{{ bookMeta(book) }}</div>
          </div>
          <div class="text-item-progress">
            <div class="progress-bar"><span :style="{ width: bookProgress(book) + '%' }" /></div>
          </div>
          <button
            class="delete-btn"
            aria-label="Удалить"
            @click.stop="removeBook(book)"
          >
            <IconTrash />
          </button>
        </li>
      </ul>
    </template>

    <AddBookSheet :open="addSheetOpen" @close="addSheetOpen = false" @added="load" />
    <AppSettingsSheet
      :open="appSettingsOpen"
      :dev-mode="devMode"
      :owner="owner"
      @close="appSettingsOpen = false"
      @update:dev-mode="changeDevMode"
      @open-feedback="openFeedback"
    />
    <FeedbackSheet :open="feedbackOpen" @close="feedbackOpen = false" />
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

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  width: 40px;
  height: 40px;
  border-radius: 10px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  border: none;
  background: var(--secondary-bg);
  color: var(--hint);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--button);
  color: var(--button-text);
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
  padding: 4px 16px 0;
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
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--hint);
  display: flex;
  align-items: center;
  justify-content: center;
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

.delete-btn {
  border: none;
  background: none;
  color: var(--hint);
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
</style>
