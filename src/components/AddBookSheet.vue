<script setup>
import { ref } from 'vue'
import { addBook } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'

defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'added'])

const title = ref('')
const text = ref('')
const submitting = ref(false)
const error = ref('')

async function submit() {
  if (!title.value.trim() || !text.value.trim()) {
    error.value = 'Заполни название и текст'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const { telegramId, username } = getTelegramUser()
    await addBook({ telegramId, username, title: title.value.trim(), text: text.value.trim() })
    title.value = ''
    text.value = ''
    emit('added')
    emit('close')
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="sheet-backdrop" :class="{ open }" @click="emit('close')" />
  <div class="sheet" :class="{ open }">
    <div class="sheet-handle" />
    <h2>Добавить текст</h2>

    <input v-model="title" class="input" type="text" placeholder="Название" />
    <textarea
      v-model="text"
      class="textarea"
      placeholder="Вставь текст книги или статьи целиком..."
      rows="6"
    />

    <p v-if="error" class="error">{{ error }}</p>

    <button class="submit-btn" :disabled="submitting" @click="submit">
      {{ submitting ? 'Обрабатываю...' : 'Добавить' }}
    </button>
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

.input,
.textarea {
  width: 100%;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  margin-bottom: 10px;
  resize: vertical;
}

.error {
  color: #e5484d;
  font-size: 13px;
  margin: 0 0 10px;
}

.submit-btn {
  width: 100%;
  border: none;
  background: var(--button);
  color: var(--button-text);
  padding: 12px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.6;
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
