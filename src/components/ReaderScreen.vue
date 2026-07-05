<script setup>
import { ref, onMounted } from 'vue'
import SettingsSheet from './SettingsSheet.vue'
import { getBookChunks } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'

const props = defineProps({
  book: { type: Object, required: true },
})

const emit = defineEmits(['back'])

const tg = window.Telegram?.WebApp

const settingsOpen = ref(false)
const fontSize = ref(18)
const theme = ref('auto')
const playing = ref(false)

const loading = ref(true)
const error = ref('')
const chunks = ref([])
const deliveredCount = ref(0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { telegramId } = getTelegramUser()
    const data = await getBookChunks(props.book.id, telegramId)
    chunks.value = data.chunks
    deliveredCount.value = data.deliveredCount
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function togglePlay() {
  playing.value = !playing.value
  tg?.HapticFeedback?.impactOccurred('medium')
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
        <p v-for="chunk in chunks.slice(0, deliveredCount)" :key="chunk.position">
          {{ chunk.content }}
        </p>
        <p v-if="deliveredCount < chunks.length" class="state-message">
          Ещё {{ chunks.length - deliveredCount }} порций впереди — следующая придёт в Telegram по
          расписанию.
        </p>
      </template>
    </div>

    <div class="reader-toolbar">
      <button class="tool-btn" @click="togglePlay">
        {{ playing ? '⏸ Пауза' : '▶ Слушать' }}
      </button>
    </div>

    <SettingsSheet
      :open="settingsOpen"
      :font-size="fontSize"
      :theme="theme"
      @close="settingsOpen = false"
      @update:font-size="fontSize = $event"
      @update:theme="theme = $event"
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

.state-message {
  color: var(--hint);
  font-size: 14px;
}

.state-message.error {
  color: #e5484d;
}

.reader-toolbar {
  padding: 12px 16px 20px;
  border-top: 1px solid var(--separator);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-btn {
  align-self: flex-start;
  border: none;
  background: var(--button);
  color: var(--button-text);
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
</style>
