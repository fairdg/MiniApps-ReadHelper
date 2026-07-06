<script setup>
import { ref, computed, onMounted } from 'vue'
import SettingsSheet from './SettingsSheet.vue'
import { getBookChunks, updateDeliveryFrequency } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'

const props = defineProps({
  book: { type: Object, required: true },
})

const emit = defineEmits(['back'])

const settingsOpen = ref(false)
const fontSize = ref(18)
const theme = ref('auto')
const notificationsPerDay = ref(4)

const loading = ref(true)
const error = ref('')
const chunks = ref([])
const deliveredCount = ref(0)

// Группируем доставленные порции по главам, чтобы в UI они шли отдельными
// блоками, а не сплошным текстом. chunk.chapter === null — глав не нашли,
// тогда просто рендерим плоским списком (заголовков не будет).
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

  return sections
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { telegramId } = getTelegramUser()
    const data = await getBookChunks(props.book.id, telegramId)
    chunks.value = data.chunks
    deliveredCount.value = data.deliveredCount
    notificationsPerDay.value = data.notificationsPerDay
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

onMounted(load)
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <button class="icon-btn" aria-label="Назад" @click="emit('back')">←</button>
      <h1 class="reader-title">{{ book.title }}</h1>
      <button class="icon-btn" aria-label="Настройки" @click="settingsOpen = true">Aa</button>
    </header>

    <div class="reader-content" :style="{ fontSize: fontSize + 'px' }">
      <p v-if="loading" class="state-message">Загружаю…</p>
      <p v-else-if="error" class="state-message error">{{ error }}</p>
      <p v-else-if="deliveredCount === 0" class="state-message">
        Первая порция скоро придёт в Telegram — как только это случится, она появится и здесь.
      </p>
      <template v-else>
        <div v-for="(section, i) in groupedSections" :key="i" class="chapter-section">
          <h2 v-if="section.chapter" class="chapter-heading">{{ section.chapter }}</h2>
          <p v-for="chunk in section.chunks" :key="chunk.position">{{ chunk.content }}</p>
        </div>
        <p v-if="deliveredCount < chunks.length" class="state-message">
          Ещё {{ chunks.length - deliveredCount }} порций впереди — следующая придёт в Telegram по
          расписанию.
        </p>
      </template>
    </div>

    <SettingsSheet
      :open="settingsOpen"
      :font-size="fontSize"
      :theme="theme"
      :notifications-per-day="notificationsPerDay"
      @close="settingsOpen = false"
      @update:font-size="fontSize = $event"
      @update:theme="theme = $event"
      @update:notifications-per-day="changeNotificationsPerDay"
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

.reader-content p {
  margin: 0 0 16px;
}

.chapter-section + .chapter-section {
  margin-top: 8px;
}

.chapter-heading {
  font-size: 15px;
  font-weight: 600;
  color: var(--hint);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0 0 12px;
}

.state-message {
  color: var(--hint);
  font-size: 14px;
}

.state-message.error {
  color: #e5484d;
}
</style>
