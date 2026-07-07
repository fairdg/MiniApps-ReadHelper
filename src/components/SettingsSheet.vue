<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  fontSize: { type: Number, required: true },
  notificationsPerDay: { type: Number, required: true },
  deliveryActive: { type: Boolean, required: true },
  targetWords: { type: Number, required: true },
})

const emit = defineEmits([
  'close',
  'update:fontSize',
  'update:notificationsPerDay',
  'update:deliveryActive',
  'update:targetWords',
])

function changeFont(delta) {
  const next = Math.min(28, Math.max(14, props.fontSize + delta))
  emit('update:fontSize', next)
}

function changeFrequency(delta) {
  const next = Math.min(14, Math.max(1, props.notificationsPerDay + delta))
  emit('update:notificationsPerDay', next)
}

// Смена размера порции пересобирает все чанки и сбрасывает прогресс чтения —
// в отличие от остальных настроек здесь это не должно применяться на каждый
// тап степпера, а только по явному подтверждению.
const pendingTargetWords = ref(props.targetWords)
watch(
  () => props.targetWords,
  (value) => {
    pendingTargetWords.value = value
  },
)

function changeTargetWords(delta) {
  pendingTargetWords.value = Math.min(300, Math.max(40, pendingTargetWords.value + delta))
}

function applyTargetWords() {
  emit('update:targetWords', pendingTargetWords.value)
}
</script>

<template>
  <div class="sheet-backdrop" :class="{ open: props.open }" @click="emit('close')" />
  <div class="sheet" :class="{ open: props.open }">
    <div class="sheet-handle" />
    <h2>Настройки</h2>

    <div class="setting-row">
      <span>Размер шрифта</span>
      <div class="stepper">
        <button @click="changeFont(-2)">A-</button>
        <span>{{ fontSize }}</span>
        <button @click="changeFont(2)">A+</button>
      </div>
    </div>

    <div class="setting-row">
      <span>Уведомлений в день</span>
      <div class="stepper">
        <button @click="changeFrequency(-1)">-</button>
        <span>{{ notificationsPerDay }}</span>
        <button @click="changeFrequency(1)">+</button>
      </div>
    </div>

    <div class="setting-row">
      <span>Размер порции — ~{{ pendingTargetWords }} слов</span>
      <div class="stepper">
        <button @click="changeTargetWords(-20)">-</button>
        <span>{{ pendingTargetWords }}</span>
        <button @click="changeTargetWords(20)">+</button>
      </div>
    </div>
    <template v-if="pendingTargetWords !== targetWords">
      <button class="apply-btn" @click="applyTargetWords">Применить</button>
      <p class="apply-hint">Порции пересоберутся заново, текущее место в книге сохранится примерно</p>
    </template>

    <div class="setting-row">
      <span>Доставка</span>
      <div class="segmented">
        <button
          class="seg-btn"
          :class="{ active: !deliveryActive }"
          @click="emit('update:deliveryActive', false)"
        >
          Пауза
        </button>
        <button
          class="seg-btn"
          :class="{ active: deliveryActive }"
          @click="emit('update:deliveryActive', true)"
        >
          Активна
        </button>
      </div>
    </div>
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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 15px;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--secondary-bg);
  padding: 6px 12px;
  border-radius: 10px;
}

.stepper button {
  border: none;
  background: none;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
}

.apply-btn {
  width: 100%;
  border: none;
  background: var(--button);
  color: var(--button-text);
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin: 0 0 6px;
}

.apply-hint {
  color: var(--hint);
  font-size: 12px;
  margin: 0 0 10px;
  text-align: center;
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
