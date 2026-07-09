<script setup>
import { ref, toRef, watch } from 'vue'
import IconFeedback from './icons/IconFeedback.vue'
import { useBodyScrollLock } from '../lib/bodyScrollLock.js'
import { addAdmin, removeAdmin } from '../lib/api.js'
import { getTelegramUser } from '../lib/telegramUser.js'
import { checkAdmin } from '../lib/devMode.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  devMode: { type: Boolean, required: true },
  owner: { type: Boolean, default: false },
})

useBodyScrollLock(toRef(props, 'open'))

const emit = defineEmits(['close', 'update:devMode', 'open-feedback'])

const admins = ref([])
const newAdminUsername = ref('')
const adminError = ref('')
const adminBusy = ref(false)

async function loadAdmins() {
  if (!props.owner) return
  const { telegramId } = getTelegramUser()
  const result = await checkAdmin(telegramId)
  admins.value = result.admins ?? []
}

// Список нужен, только пока открыта шторка и пользователь — владелец;
// перезагружаем при каждом открытии, а не держим вечно закэшированным.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) loadAdmins()
  },
)

async function submitAddAdmin() {
  const username = newAdminUsername.value.trim()
  if (!username) return

  adminBusy.value = true
  adminError.value = ''
  try {
    const { telegramId } = getTelegramUser()
    await addAdmin(telegramId, username)
    newAdminUsername.value = ''
    await loadAdmins()
  } catch (err) {
    adminError.value = err.message
  } finally {
    adminBusy.value = false
  }
}

async function submitRemoveAdmin(admin) {
  adminBusy.value = true
  adminError.value = ''
  try {
    const { telegramId } = getTelegramUser()
    await removeAdmin(telegramId, admin.telegram_id)
    admins.value = admins.value.filter((a) => a.telegram_id !== admin.telegram_id)
  } catch (err) {
    adminError.value = err.message
  } finally {
    adminBusy.value = false
  }
}
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

      <h3 class="section-title">Админы</h3>

      <ul v-if="admins.length" class="admin-list">
        <li v-for="a in admins" :key="a.telegram_id" class="admin-item">
          <span>@{{ a.username || a.telegram_id }}</span>
          <button class="remove-btn" :disabled="adminBusy" @click="submitRemoveAdmin(a)">
            Убрать
          </button>
        </li>
      </ul>
      <p v-else class="hint">Пока нет назначенных админов.</p>

      <form class="admin-form" @submit.prevent="submitAddAdmin">
        <input
          v-model="newAdminUsername"
          class="admin-input"
          type="text"
          placeholder="username без @"
        />
        <button class="add-btn" type="submit" :disabled="adminBusy || !newAdminUsername.trim()">
          Добавить
        </button>
      </form>
      <p class="hint">Добавить можно только того, кто уже хоть раз открывал это приложение.</p>
      <p v-if="adminError" class="error">{{ adminError }}</p>
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

.section-title {
  font-size: 13px;
  margin: 18px 0 8px;
  color: var(--hint);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.admin-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--secondary-bg);
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 14px;
}

.remove-btn {
  border: none;
  background: none;
  color: #e5484d;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 8px;
  cursor: pointer;
}

.admin-form {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.admin-input {
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

.add-btn {
  flex-shrink: 0;
  border: none;
  background: var(--button);
  color: var(--button-text);
  font-size: 13px;
  font-weight: 600;
  padding: 0 16px;
  height: 40px;
  border-radius: 10px;
  cursor: pointer;
}

.add-btn:disabled {
  opacity: 0.5;
}

.error {
  color: #e5484d;
  font-size: 13px;
  margin: 8px 0 0;
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
