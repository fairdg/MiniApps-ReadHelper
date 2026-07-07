<script setup>
import { ref, computed, onMounted } from 'vue'
import SettingsSheet from './SettingsSheet.vue'
import {
  getBookChunks,
  updateDeliveryFrequency,
  updateDeliveryActive,
  updateChunkSize,
  deliverNow,
} from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'
import { isDevMode, isOwner } from '../lib/devMode.js'
import { confirmDialog } from '../lib/confirm.js'
import IconGear from './icons/IconGear.vue'

const props = defineProps({
  book: { type: Object, required: true },
})

const emit = defineEmits(['back'])

// Кнопка "отправить сейчас" — только владельцу с включённым режимом
// разработчика. Реальная защита от обхода — на бэкенде (deliver-now.js).
const devMode = isDevMode() && isOwner(getTelegramUser().telegramId)

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
// Последняя секция — "в процессе", пока есть недоставленные порции этой
// книги; все предыдущие уже точно доставлены целиком — "прочитано".
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

  return sections.map((section, i) => ({
    ...section,
    status:
      i === sections.length - 1 && deliveredCount.value < chunks.value.length
        ? 'in-progress'
        : 'read',
  }))
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

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { telegramId } = getTelegramUser()
    const data = await getBookChunks(props.book.id, telegramId)
    chunks.value = data.chunks
    deliveredCount.value = data.deliveredCount
    notificationsPerDay.value = data.notificationsPerDay
    deliveryActive.value = data.deliveryActive
    targetWords.value = data.book.target_words
    expandedSections.value = new Set([groupedSections.value.length - 1])
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function changeNotificationsPerDay(value) {
  notificationsPerDay.value = value
  try {
    const { telegramId } = getTelegramUser()
    await updateDeliveryFrequency(props.book.id, telegramId, value)
  } catch (err) {
    console.error('Не удалось обновить частоту уведомлений:', err)
  }
}

async function changeDeliveryActive(value) {
  deliveryActive.value = value
  try {
    const { telegramId } = getTelegramUser()
    await updateDeliveryActive(props.book.id, telegramId, value)
  } catch (err) {
    console.error('Не удалось изменить статус доставки:', err)
  }
}

// Смена размера порции пересобирает все чанки заново — прогресс чтения
// сбрасывается на начало, поэтому спрашиваем подтверждение перед вызовом.
async function changeTargetWords(value) {
  const ok = await confirmDialog(
    'Изменить размер порции? Все порции будут пересобраны заново, прогресс чтения этой книги сбросится на начало.',
  )
  if (!ok) return

  try {
    const { telegramId } = getTelegramUser()
    await updateChunkSize(props.book.id, telegramId, value)
    await load()
  } catch (err) {
    error.value = err.message
  }
}

async function sendNow() {
  sendingNow.value = true
  sendNowError.value = ''
  try {
    const { telegramId } = getTelegramUser()
    const result = await deliverNow(props.book.id, telegramId)
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

onMounted(load)
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <button class="icon-btn" aria-label="Назад" @click="emit('back')">←</button>
      <h1 class="reader-title">{{ book.title }}</h1>
      <button class="icon-btn" aria-label="Настройки" @click="settingsOpen = true">
        <IconGear />
      </button>
    </header>

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
            <div v-for="chunk in section.chunks" :key="chunk.position" class="message-block">
              <div class="message-label">Порция {{ chunk.position + 1 }}</div>
              <p>{{ chunk.content }}</p>
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
      <p v-if="sendNowError" class="state-message error">{{ sendNowError }}</p>
    </div>

    <SettingsSheet
      :open="settingsOpen"
      :font-size="fontSize"
      :notifications-per-day="notificationsPerDay"
      :delivery-active="deliveryActive"
      :target-words="targetWords"
      @close="settingsOpen = false"
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
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
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
  margin: 0;
}

.message-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--hint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-bottom: 6px;
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
