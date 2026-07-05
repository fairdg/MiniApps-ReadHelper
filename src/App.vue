<script setup>
import { ref, onMounted, watch } from 'vue'
import HomeScreen from './components/HomeScreen.vue'
import ReaderScreen from './components/ReaderScreen.vue'

const tg = window.Telegram?.WebApp

const screen = ref('home') // 'home' | 'reader'
const activeBook = ref(null)

function openText(book) {
  activeBook.value = book
  screen.value = 'reader'
}

function goHome() {
  screen.value = 'home'
}

watch(screen, (value) => {
  if (value === 'reader') {
    tg?.BackButton?.show()
  } else {
    tg?.BackButton?.hide()
  }
})

onMounted(() => {
  tg?.ready()
  tg?.expand()
  tg?.BackButton?.onClick(goHome)
})
</script>

<template>
  <HomeScreen v-if="screen === 'home'" @open-text="openText" />
  <ReaderScreen v-else :book="activeBook" @back="goHome" />
</template>
