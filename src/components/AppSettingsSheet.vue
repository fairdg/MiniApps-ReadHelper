<script setup>
import { toRef } from 'vue'
import IconFeedback from './icons/IconFeedback.vue'
import { useBodyScrollLock } from '../lib/bodyScrollLock.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  devMode: { type: Boolean, required: true },
  owner: { type: Boolean, default: false },
})

useBodyScrollLock(toRef(props, 'open'))

const emit = defineEmits(['close', 'update:devMode', 'open-feedback'])
</script>

<template>
  <div class="sheet-backdrop" :class="{ open }" @click="emit('close')" />
  <div class="sheet" :class="{ open }">
    <div class="sheet-handle" />
    <h2>Настройки приложения</h2>

    <button class="link-btn" @click="emit('open-feedback')">
      <IconFeedback />
      Оставить отзыв
    </button>

    <template v-if="owner">
      <div class="setting-row">
        <span>Режим разработчика</span>
        <div class="segmented">
          <button
            class="seg-btn"
            :class="{ active: !devMode }"
            @click="emit('update:devMode', false)"
          >
            Выкл
          </button>
          <button
            class="seg-btn"
            :class="{ active: devMode }"
            @click="emit('update:devMode', true)"
          >
            Вкл
          </button>
        </div>
      </div>

      <p v-if="devMode" class="hint">
        В режиме разработчика на экране чтения появится кнопка "Отправить порцию сейчас" — для
        проверки доставки без ожидания реального интервала.
      </p>
    </template>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg);
  border-radius: 18px 18px 0 0;
  padding: 10px 20px 28px;
  transform: translateY(100%);
  transition: transform 0.25s ease;
  z-index: 20;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
  /* body заблокирован (useBodyScrollLock), пока открыта шторка — если её
     содержимое не помещается (особенно когда клавиатура съедает часть
     экрана), скроллить должна сама шторка, а не документ. */
  max-height: 85vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.sheet.open {
  transform: translateY(0);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--hint);
  opacity: 0.4;
  border-radius: 2px;
  margin: 6px auto 14px;
}

.sheet h2 {
  font-size: 15px;
  margin: 0 0 14px;
  color: var(--hint);
  font-weight: 500;
}

.link-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  font-size: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 4px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 15px;
}

.segmented {
  display: flex;
  background: var(--secondary-bg);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}

.seg-btn {
  border: none;
  background: none;
  color: var(--text);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.seg-btn.active {
  background: var(--button);
  color: var(--button-text);
}

.hint {
  font-size: 13px;
  color: var(--hint);
  margin: 4px 0 0;
  line-height: 1.4;
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  z-index: 15;
}

.sheet-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}
</style>
