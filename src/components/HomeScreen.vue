<script setup>
const emit = defineEmits(['open-text'])

const texts = [
  {
    id: 1,
    icon: '📄',
    title: 'Атомные привычки — глава 3',
    meta: '2 400 слов · 12 мин чтения',
    progress: 65,
  },
  {
    id: 2,
    icon: '🔗',
    title: 'Статья: Как работает память',
    meta: '980 слов · 5 мин чтения',
    progress: 10,
  },
  {
    id: 3,
    icon: '📄',
    title: 'Заметки к лекции по биологии',
    meta: '1 800 слов · 9 мин чтения',
    progress: 0,
  },
]

function addText() {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light')
  alert('Здесь будет добавление нового текста (файл, ссылка или вставленный текст).')
}
</script>

<template>
  <section class="screen">
    <header class="topbar">
      <h1>ReadHelper</h1>
      <button class="icon-btn" aria-label="Добавить" @click="addText">+</button>
    </header>

    <div class="search-wrap">
      <input type="text" placeholder="Поиск по текстам..." class="search-input" />
    </div>

    <ul class="text-list">
      <li
        v-for="text in texts"
        :key="text.id"
        class="text-item"
        @click="emit('open-text', text)"
      >
        <div class="text-item-icon">{{ text.icon }}</div>
        <div class="text-item-body">
          <div class="text-item-title">{{ text.title }}</div>
          <div class="text-item-meta">{{ text.meta }}</div>
        </div>
        <div class="text-item-progress">
          <div class="progress-bar"><span :style="{ width: text.progress + '%' }" /></div>
        </div>
      </li>
    </ul>
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

.topbar h1 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  text-align: center;
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

.search-wrap {
  padding: 0 16px 12px;
}

.search-input {
  width: 100%;
  border: none;
  background: var(--secondary-bg);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 15px;
}

.search-input::placeholder {
  color: var(--hint);
}

.text-list {
  list-style: none;
  margin: 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.text-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--secondary-bg);
  padding: 12px 14px;
  border-radius: 14px;
  cursor: pointer;
}

.text-item-icon {
  font-size: 22px;
  width: 36px;
  text-align: center;
}

.text-item-body {
  flex: 1;
  min-width: 0;
}

.text-item-title {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-item-meta {
  font-size: 12px;
  color: var(--hint);
  margin-top: 2px;
}

.text-item-progress {
  width: 44px;
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
