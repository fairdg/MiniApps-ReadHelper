<script setup>
defineProps({
  open: { type: Boolean, default: false },
  devMode: { type: Boolean, required: true },
  owner: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'update:devMode'])
</script>

<template>
  <div class="sheet-backdrop" :class="{ open }" @click="emit('close')" />
  <div class="sheet" :class="{ open }">
    <div class="sheet-handle" />
    <h2>Настройки приложения</h2>

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

    <p v-else class="hint">Здесь скоро появятся настройки приложения.</p>
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
