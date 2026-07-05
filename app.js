const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const screens = {
  home: document.getElementById('screen-home'),
  reader: document.getElementById('screen-reader'),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove('active'));
  screens[name].classList.add('active');
}

document.querySelectorAll('.text-item').forEach((item) => {
  item.addEventListener('click', () => {
    showScreen('reader');
    tg?.BackButton?.show();
  });
});

document.getElementById('back-btn').addEventListener('click', () => {
  showScreen('home');
  tg?.BackButton?.hide();
});

tg?.BackButton?.onClick(() => {
  showScreen('home');
  tg.BackButton.hide();
});

document.getElementById('add-btn').addEventListener('click', () => {
  tg?.HapticFeedback?.impactOccurred('light');
  alert('Здесь будет добавление нового текста (файл, ссылка или вставленный текст).');
});

// Play / pause (заглушка)
const playBtn = document.getElementById('play-btn');
let playing = false;
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ Пауза' : '▶ Слушать';
  tg?.HapticFeedback?.impactOccurred('medium');
});

// Настройки (bottom sheet)
const sheet = document.getElementById('settings-sheet');
const backdrop = document.getElementById('sheet-backdrop');
const settingsBtn = document.getElementById('settings-btn');

function openSheet() {
  sheet.classList.add('open');
  backdrop.classList.add('open');
}
function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
}

settingsBtn.addEventListener('click', openSheet);
backdrop.addEventListener('click', closeSheet);

// Размер шрифта
const readerContent = document.getElementById('reader-content');
const fontLabel = document.getElementById('font-size-label');
let fontSize = 18;

document.getElementById('font-plus').addEventListener('click', () => {
  fontSize = Math.min(fontSize + 2, 28);
  readerContent.style.fontSize = fontSize + 'px';
  fontLabel.textContent = fontSize;
});
document.getElementById('font-minus').addEventListener('click', () => {
  fontSize = Math.max(fontSize - 2, 14);
  readerContent.style.fontSize = fontSize + 'px';
  fontLabel.textContent = fontSize;
});

// Переключение темы (заглушка визуального выбора)
document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Настройка кнопки Telegram MainButton (пример использования)
tg?.MainButton?.setParams({
  text: 'Готово',
  is_visible: false,
});
