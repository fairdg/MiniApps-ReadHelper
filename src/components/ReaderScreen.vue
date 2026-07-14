<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import SettingsSheet from './SettingsSheet.vue'
import {
  getBookChunks,
  updateDeliveryFrequency,
  updateDeliveryActive,
  updateChunkSize,
  updateBookTitle,
  deliverNow,
  resetProgress,
} from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'
import { isDevMode, isOwner, checkAdmin } from '../lib/devMode.js'
import { confirmDialog } from '../lib/confirm.js'
import IconGear from './icons/IconGear.vue'

const props = defineProps({
  book: { type: Object, required: true },
})

const emit = defineEmits(['back'])

// Кнопка "отправить сейчас" — владельцу и назначенным им админам с включённым
// режимом разработчика. Реальная защита от обхода — на бэкенде
// (deliver-now.js через server/adminAccess.js). Мгновенно по env (владелец),
// пока не пришёл ответ checkAdmin() — тогда учитывает и админов из БД.
const admin = ref(isOwner(getTelegramUser().telegramId))
const devMode = computed(() => isDevMode() && admin.value)

checkAdmin().then((result) => {
  admin.value = result.isAdmin
})

const settingsOpen = ref(false)
const fontSize = ref(18)
const notificationsPerDay = ref(4)
const deliveryActive = ref(true)
const targetWords = ref(120)

const loading = ref(true)
const error = ref('')
const chunks = ref([])
const deliveredCount = ref(0)

const sendingNow = ref(false)
const sendNowError = ref('')

// Группируем доставленные порции по главам, чтобы в UI они шли отдельными
// блоками, а не сплошным текстом. chunk.chapter === null — глав не нашли,
// тогда весь текст — одна секция без заголовка главы.
// Секция "в процессе", только если следующая (ещё не доставленная) порция
// принадлежит той же главе — иначе эта глава уже дочитана целиком, даже если
// у книги в целом остались недоставленные порции из следующей главы.
const groupedSections = computed(() => {
  const delivered = chunks.value.slice(0, deliveredCount.value)
  const sections = []

  for (const chunk of delivered) {
    const last = sections[sections.length - 1]
    if (last && last.chapter === chunk.chapter) {
      last.chunks.push(chunk)
    } else {
      sections.push({ chapter: chunk.chapter, chunks: [chunk] })
    }
  }

  const nextChunk = chunks.value[deliveredCount.value]

  return sections.map((section, i) => {
    const isLast = i === sections.length - 1
    const chapterContinues = isLast && nextChunk && nextChunk.chapter === section.chapter
    return { ...section, status: chapterContinues ? 'in-progress' : 'read' }
  })
})

// Свёрнуто по умолчанию — кроме самой последней (текущей) секции: старые
// главы не должны загромождать экран, а то, что сейчас читается, видно сразу.
const expandedSections = ref(new Set())

function toggleSection(i) {
  const next = new Set(expandedSections.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  expandedSections.value = next
}

// Внутри открытой главы порции тоже сворачиваются — иначе длинная глава всё
// равно превращается в стену текста. Открыта только самая свежая порция
// (её и так только что доставили — логично увидеть сразу), остальные — по
// клику. Ключ — chunk.position, а не индекс: не зависит от группировки.
const expandedPortions = ref(new Set())

function togglePortion(position) {
  const next = new Set(expandedPortions.value)
  if (next.has(position)) next.delete(position)
  else next.add(position)
  expandedPortions.value = next
}

// DOM-узлы порций по их position — нужно, чтобы прокрутить к конкретной
// порции (последней при открытии экрана, или любой по номеру из формы ниже).
const portionEls = new Map()

function setPortionEl(position, el) {
  if (el) portionEls.set(position, el)
  else portionEls.delete(position)
}

function scrollToPortion(position) {
  portionEls.get(position)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const jumpInput = ref('')
const jumpError = ref('')

// Раскрывает главу и саму порцию с нужным номером (они могли быть свёрнуты)
// и прокручивает к ней — чтобы не листать вручную десятки уже прочитанных
// порций в поисках конкретной.
async function jumpToPortion() {
  jumpError.value = ''
  const targetPosition = Number(jumpInput.value) - 1

  if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition >= deliveredCount.value) {
    jumpError.value = `Введи номер от 1 до ${deliveredCount.value}`
    return
  }

  const sectionIndex = groupedSections.value.findIndex((section) =>
    section.chunks.some((chunk) => chunk.position === targetPosition),
  )
  if (sectionIndex !== -1) expandedSections.value = new Set(expandedSections.value).add(sectionIndex)
  expandedPortions.value = new Set(expandedPortions.value).add(targetPosition)

  await nextTick()
  scrollToPortion(targetPosition)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getBookChunks(props.book.id)
    chunks.value = data.chunks
    deliveredCount.value = data.deliveredCount
    notificationsPerDay.value = data.notificationsPerDay
    deliveryActive.value = data.deliveryActive
    targetWords.value = data.book.target_words
    expandedSections.value = new Set([groupedSections.value.length - 1])
    const lastPosition = chunks.value[deliveredCount.value - 1]?.position
    expandedPortions.value = lastPosition != null ? new Set([lastPosition]) : new Set()

    if (lastPosition != null) {
      await nextTick()
      scrollToPortion(lastPosition)
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// book — проп (нельзя мутировать напрямую), поэтому держим отображаемое
// название отдельно и обновляем его локально после успешного сохранения.
const displayTitle = ref(props.book.title)

async function changeTitle(value) {
  const previous = displayTitle.value
  displayTitle.value = value
  try {
    await updateBookTitle(props.book.id, value)
  } catch (err) {
    displayTitle.value = previous
    error.value = err.message
  }
}

async function changeNotificationsPerDay(value) {
  notificationsPerDay.value = value
  try {
    await updateDeliveryFrequency(props.book.id, value)
  } catch (err) {
    console.error('Не удалось обновить частоту уведомлений:', err)
  }
}

async function changeDeliveryActive(value) {
  deliveryActive.value = value
  try {
    await updateDeliveryActive(props.book.id, value)
  } catch (err) {
    console.error('Не удалось изменить статус доставки:', err)
  }
}

// Смена размера порции пересобирает все чанки заново — границы порций
// меняются, поэтому спрашиваем подтверждение (бэкенд сам переставляет курсор
// прогресса на примерно то же место в книге, см. chunk-size.js).
async function changeTargetWords(value) {
  const ok = await confirmDialog(
    'Изменить размер порции? Все порции будут пересобраны заново — место в книге сохранится примерно, но точные границы порций изменятся.',
  )
  if (!ok) return

  try {
    await updateChunkSize(props.book.id, value)
    await load()
  } catch (err) {
    error.value = err.message
  }
}

async function sendNow() {
  sendingNow.value = true
  sendNowError.value = ''
  try {
    const result = await deliverNow(props.book.id)
    if (result.sent) {
      await load()
    } else {
      sendNowError.value = 'Больше нечего отправлять — все порции уже доставлены'
    }
  } catch (err) {
    sendNowError.value = err.message
  } finally {
    sendingNow.value = false
  }
}

const resettingProgress = ref(false)

async function resetBookProgress() {
  const ok = await confirmDialog('Сбросить прогресс и начать книгу заново?')
  if (!ok) return

  resettingProgress.value = true
  sendNowError.value = ''
  try {
    await resetProgress(props.book.id)
    await load()
  } catch (err) {
    sendNowError.value = err.message
  } finally {
    resettingProgress.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <button class="icon-btn" aria-label="Назад" @click="emit('back')">←</button>
      <h1 class="reader-title">{{ displayTitle }}</h1>
      <button class="icon-btn" aria-label="Настройки" @click="settingsOpen = true">
        <IconGear />
      </button>
    </header>

    <div v-if="chunks.length > 0" class="progress-bar">
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: Math.round((deliveredCount / chunks.length) * 100) + '%' }"
        />
      </div>
      <span class="progress-label">Порция {{ deliveredCount }} из {{ chunks.length }}</span>
    </div>

    <form v-if="deliveredCount > 1" class="jump-form" @submit.prevent="jumpToPortion">
      <input
        v-model="jumpInput"
        type="number"
        min="1"
        :max="deliveredCount"
        placeholder="№ порции"
        class="jump-input"
      />
      <button type="submit" class="jump-btn">Перейти</button>
    </form>
    <p v-if="jumpError" class="state-message error jump-error">{{ jumpError }}</p>

    <div class="reader-content" :style="{ fontSize: fontSize + 'px' }">
      <p v-if="loading" class="state-message">Загружаю…</p>
      <p v-else-if="error" class="state-message error">{{ error }}</p>
      <p v-else-if="deliveredCount === 0" class="state-message">
        Первая порция скоро придёт в Telegram — как только это случится, она появится и здесь.
      </p>
      <template v-else>
        <div v-for="(section, i) in groupedSections" :key="i" class="chapter-section">
          <button class="chapter-toggle" @click="toggleSection(i)">
            <span class="chapter-toggle-title">
              {{ section.chapter || `Порции ${section.chunks[0].position + 1}–${section.chunks[section.chunks.length - 1].position + 1}` }}
            </span>
            <span class="status-badge" :class="section.status">
              {{ section.status === 'in-progress' ? 'В процессе' : 'Прочитано' }}
            </span>
            <span class="chevron" :class="{ open: expandedSections.has(i) }">⌄</span>
          </button>
          <template v-if="expandedSections.has(i)">
            <div
              v-for="chunk in section.chunks"
              :key="chunk.position"
              class="message-block"
              :ref="(el) => setPortionEl(chunk.position, el)"
            >
              <button class="message-toggle" @click="togglePortion(chunk.position)">
                <span class="message-label">Порция {{ chunk.position + 1 }}</span>
                <span class="chevron" :class="{ open: expandedPortions.has(chunk.position) }">⌄</span>
              </button>
              <p v-if="expandedPortions.has(chunk.position)">{{ chunk.content }}</p>
            </div>
          </template>
        </div>
        <p v-if="deliveredCount < chunks.length" class="state-message">
          Ещё {{ chunks.length - deliveredCount }} порций впереди — следующая придёт в Telegram по
          расписанию.
        </p>
      </template>
    </div>

    <div v-if="devMode" class="dev-toolbar">
      <button
        class="dev-btn"
        :disabled="sendingNow || deliveredCount >= chunks.length"
        @click="sendNow"
      >
        {{ sendingNow ? 'Отправляю…' : 'Отправить порцию сейчас' }}
      </button>
      <button
        class="dev-btn"
        :disabled="resettingProgress || deliveredCount === 0"
        @click="resetBookProgress"
      >
        {{ resettingProgress ? 'Сбрасываю…' : 'Сбросить прогресс' }}
      </button>
      <p v-if="sendNowError" class="state-message error">{{ sendNowError }}</p>
    </div>

    <SettingsSheet
      :open="settingsOpen"
      :title="displayTitle"
      :font-size="fontSize"
      :notifications-per-day="notificationsPerDay"
      :delivery-active="deliveryActive"
      :target-words="targetWords"
      @close="settingsOpen = false"
      @update:title="changeTitle"
      @update:font-size="fontSize = $event"
      @update:notifications-per-day="changeNotificationsPerDay"
      @update:target-words="changeTargetWords"
      @update:delivery-active="changeDeliveryActive"
    />
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

.reader-title {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.progress-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px 10px;
}

.progress-track {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: var(--secondary-bg);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--button);
  transition: width 0.2s ease;
}

.progress-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--hint);
}

.jump-form {
  display: flex;
  gap: 8px;
  padding: 0 20px 10px;
}

.jump-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  /* 16px — минимум, ниже которого iOS Safari сам зумит страницу при фокусе */
  font-size: 16px;
  padding: 8px 12px;
  border-radius: 10px;
  height: 40px;
}

.jump-btn {
  flex-shrink: 0;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  padding: 0 16px;
  height: 40px;
  border-radius: 10px;
  cursor: pointer;
}

.jump-error {
  padding: 0 20px 10px;
}

.reader-content {
  flex: 1;
  padding: 8px 20px 20px;
  line-height: 1.6;
  overflow-y: auto;
}

.message-block {
  background: var(--secondary-bg);
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.message-block p {
  margin: 8px 0 0;
}

.message-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.message-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--hint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.chapter-section + .chapter-section {
  margin-top: 8px;
}

.chapter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  text-align: left;
}

.chapter-toggle-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--hint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--hint);
  background: var(--bg);
}

.status-badge.in-progress {
  color: var(--button-text);
  background: var(--button);
}

.chevron {
  flex-shrink: 0;
  color: var(--hint);
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.state-message {
  color: var(--hint);
  font-size: 14px;
}

.state-message.error {
  color: #e5484d;
}

.dev-toolbar {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 20px;
  border-top: 1px dashed var(--separator);
  background: var(--bg);
}

.dev-btn {
  width: 100%;
  border: 1px dashed var(--hint);
  background: none;
  color: var(--text);
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
}

.dev-btn:disabled {
  opacity: 0.5;
}
</style>
