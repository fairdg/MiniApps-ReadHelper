<script setup>
import { ref } from 'vue'
import SettingsSheet from './SettingsSheet.vue'

defineProps({
  text: { type: Object, required: true },
})

const emit = defineEmits(['back'])

const tg = window.Telegram?.WebApp

const settingsOpen = ref(false)
const fontSize = ref(18)
const theme = ref('auto')
const playing = ref(false)

function togglePlay() {
  playing.value = !playing.value
  tg?.HapticFeedback?.impactOccurred('medium')
}
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <button class="icon-btn" aria-label="Назад" @click="emit('back')">←</button>
      <h1 class="reader-title">{{ text.title }}</h1>
      <button class="icon-btn" aria-label="Настройки" @click="settingsOpen = true">Aa</button>
    </header>

    <div class="reader-content" :style="{ fontSize: fontSize + 'px' }">
      <p>
        Каждое действие, которое вы совершаете, — это голос за тип человека, которым вы хотите
        стать. Ни одно отдельное событие не способно преобразить ваши убеждения, но по мере
        накопления голосов новая идентичность начинает укрепляться.
      </p>
      <p>
        Именно поэтому изменения происходят не благодаря силе воли в моменте, а благодаря
        системе, которая делает нужное поведение чуть более вероятным каждый день.
      </p>
      <p>Привычка — это не то, чего вы достигаете. Это то, кем вы становитесь.</p>
    </div>

    <div class="reader-toolbar">
      <button class="tool-btn" @click="togglePlay">
        {{ playing ? '⏸ Пауза' : '▶ Слушать' }}
      </button>
      <div class="tool-progress">
        <span>12:04</span>
        <div class="progress-bar"><span style="width: 35%" /></div>
        <span>34:20</span>
      </div>
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

.tool-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--hint);
}

.tool-progress .progress-bar {
  flex: 1;
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
