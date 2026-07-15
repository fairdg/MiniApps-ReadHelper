<script setup>
import { ref, toRef, watch } from 'vue'
import IconFeedback from './icons/IconFeedback.vue'
import { useBodyScrollLock } from '../lib/bodyScrollLock.js'
import {
  addAdmin,
  createProInvoice,
  getBillingStatus,
  grantProByUsername,
  listGrantedProUsers,
  removeAdmin,
  revokePro,
} from '../lib/api.js'
import { checkAdmin } from '../lib/devMode.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  devMode: { type: Boolean, required: true },
  admin: { type: Boolean, default: false },
  owner: { type: Boolean, default: false },
})

useBodyScrollLock(toRef(props, 'open'))

const emit = defineEmits(['close', 'update:devMode', 'open-feedback'])

const admins = ref([])
const newAdminUsername = ref('')
const adminError = ref('')
const adminBusy = ref(false)
const billing = ref(null)
const billingError = ref('')
const billingBusy = ref(false)
const proUsers = ref([])
const newProUsername = ref('')
const proBusy = ref(false)
const proError = ref('')

async function loadAdmins() {
  if (!props.owner) return
  const result = await checkAdmin()
  admins.value = result.admins ?? []
}

async function loadBilling() {
  billingError.value = ''
  try {
    billing.value = await getBillingStatus()
  } catch (err) {
    billingError.value = err.message
  }
}

async function loadProUsers() {
  if (!props.owner) return
  proError.value = ''
  try {
    const result = await listGrantedProUsers()
    proUsers.value = result.users ?? []
  } catch (err) {
    proError.value = err.message
  }
}

async function refreshBillingAfterPayment(attempt = 0) {
  await loadBilling()
  if (billing.value?.hasPro || attempt >= 4) return

  await new Promise((resolve) => window.setTimeout(resolve, 700))
  return refreshBillingAfterPayment(attempt + 1)
}

function openInvoice(invoiceLink) {
  const tg = window.Telegram?.WebApp
  if (!tg?.openInvoice) {
    throw new Error('Оплата доступна только внутри Telegram.')
  }

  return new Promise((resolve) => {
    tg.openInvoice(invoiceLink, (status) => resolve(status))
  })
}

// Список нужен, только пока открыта шторка и пользователь — владелец;
// перезагружаем при каждом открытии, а не держим вечно закэшированным.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    loadAdmins()
    loadBilling()
    loadProUsers()
  },
)

async function submitAddAdmin() {
  const username = newAdminUsername.value.trim()
  if (!username) return

  adminBusy.value = true
  adminError.value = ''
  try {
    await addAdmin(username)
    newAdminUsername.value = ''
    await loadAdmins()
  } catch (err) {
    adminError.value = err.message
  } finally {
    adminBusy.value = false
  }
}

async function submitRemoveAdmin(adminEntry) {
  adminBusy.value = true
  adminError.value = ''
  try {
    await removeAdmin(adminEntry.telegram_id)
    admins.value = admins.value.filter((a) => a.telegram_id !== adminEntry.telegram_id)
  } catch (err) {
    adminError.value = err.message
  } finally {
    adminBusy.value = false
  }
}

async function submitUpgrade() {
  billingBusy.value = true
  billingError.value = ''
  try {
    const { invoiceLink } = await createProInvoice()
    const status = await openInvoice(invoiceLink)

    if (status === 'paid') {
      await refreshBillingAfterPayment()
      return
    }

    if (status === 'failed') {
      throw new Error('Telegram не смог провести оплату.')
    }
  } catch (err) {
    billingError.value = err.message
  } finally {
    billingBusy.value = false
  }
}

async function submitGrantPro() {
  const username = newProUsername.value.trim()
  if (!username) return

  proBusy.value = true
  proError.value = ''
  try {
    await grantProByUsername(username)
    newProUsername.value = ''
    await loadProUsers()
  } catch (err) {
    proError.value = err.message
  } finally {
    proBusy.value = false
  }
}

async function submitRevokePro(user) {
  proBusy.value = true
  proError.value = ''
  try {
    await revokePro(user.telegram_id)
    proUsers.value = proUsers.value.filter((entry) => entry.telegram_id !== user.telegram_id)
  } catch (err) {
    proError.value = err.message
  } finally {
    proBusy.value = false
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

    <section class="billing-card">
      <div v-if="billing" class="billing-copy">
        <p class="billing-kicker">{{ billing.hasPro ? 'Тариф активен' : 'Бесплатный тариф' }}</p>
        <h3>{{ billing.hasPro ? 'ReadHelper Pro' : '1 книга в процессе бесплатно' }}</h3>
        <p class="hint billing-hint">
          <template v-if="billing.hasPro">
            Лимит снят. Сейчас в процессе: {{ billing.activeBookCount }}.
          </template>
          <template v-else>
            Сейчас в процессе: {{ billing.activeBookCount }} из
            {{ billing.freeActiveBooksLimit }}. Pro снимает лимит навсегда.
          </template>
        </p>
      </div>
      <p v-else class="hint billing-hint">Загружаю статус тарифа…</p>

      <button
        v-if="billing && !billing.hasPro"
        class="upgrade-btn"
        :disabled="billingBusy"
        @click="submitUpgrade"
      >
        {{ billingBusy ? 'Открываю оплату…' : `Купить Pro за ${billing.proPriceStars} ⭐` }}
      </button>
    </section>
    <p v-if="billingError" class="error">{{ billingError }}</p>

    <template v-if="admin">
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

    <template v-if="owner">
      <h3 class="section-title">Подписки Pro</h3>

      <ul v-if="proUsers.length" class="admin-list">
        <li v-for="user in proUsers" :key="user.telegram_id" class="admin-item">
          <span>@{{ user.username || user.telegram_id }}</span>
          <button class="remove-btn" :disabled="proBusy" @click="submitRevokePro(user)">
            Убрать
          </button>
        </li>
      </ul>
      <p v-else class="hint">Пока ни у кого нет активного Pro.</p>

      <form class="admin-form" @submit.prevent="submitGrantPro">
        <input
          v-model="newProUsername"
          class="admin-input"
          type="text"
          placeholder="username без @"
        />
        <button class="add-btn" type="submit" :disabled="proBusy || !newProUsername.trim()">
          Выдать Pro
        </button>
      </form>
      <p class="hint">Список включает всех пользователей с активным Pro. Выдать подписку можно только тому, кто уже хоть раз открывал приложение.</p>
      <p v-if="proError" class="error">{{ proError }}</p>

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

.billing-card {
  background: linear-gradient(135deg, rgba(41, 98, 255, 0.12), rgba(31, 184, 205, 0.16));
  border: 1px solid rgba(41, 98, 255, 0.12);
  border-radius: 16px;
  padding: 14px;
  margin: 12px 0 2px;
}

.billing-kicker {
  margin: 0 0 6px;
  color: var(--hint);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.billing-card h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.billing-hint {
  margin-top: 0;
}

.upgrade-btn {
  width: 100%;
  border: none;
  background: var(--button);
  color: var(--button-text);
  font-size: 14px;
  font-weight: 600;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  margin-top: 12px;
}

.upgrade-btn:disabled {
  opacity: 0.6;
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
