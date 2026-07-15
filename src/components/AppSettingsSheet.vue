<script setup>
import { ref, toRef, watch } from 'vue'
import IconFeedback from './icons/IconFeedback.vue'
import { useBodyScrollLock } from '../lib/bodyScrollLock.js'
import { createProInvoice, getBillingStatus } from '../lib/api.js'

const props = defineProps({
  open: { type: Boolean, default: false },
})

useBodyScrollLock(toRef(props, 'open'))

const emit = defineEmits(['close', 'open-feedback'])

const billing = ref(null)
const billingError = ref('')
const billingBusy = ref(false)

async function loadBilling() {
  billingError.value = ''
  try {
    billing.value = await getBillingStatus()
  } catch (err) {
    billingError.value = err.message
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
    loadBilling()
  },
)

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

.hint {
  font-size: 13px;
  color: var(--hint);
  margin: 4px 0 0;
  line-height: 1.4;
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
