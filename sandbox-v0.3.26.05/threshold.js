/**
 * ========================================
 * Pygmalion v0.3.0 — Порог: ЧисСлоБукВ
 * Создание Открытого Ключика (О.К.)
 * ========================================
 */

// === КОНСТАНТЫ ===
const OK_MIN_LENGTH = 3;
const OK_MAX_LENGTH = 50;  // Для песочницы
const MAX_SPACES = 5;

// === v0.3.23: Зарезервированные ключи платформы ::0::-::33:: ===
const RESERVED_OK_KEYS = [];
for (let i = 0; i <= 33; i++) {
  RESERVED_OK_KEYS.push(String(i));
}
// Также резервируем формы с ведущими нулями
for (let i = 0; i <= 33; i++) {
  RESERVED_OK_KEYS.push(String(i).padStart(2, '0'));
}

/**
 * Проверка: является ли О.К. зарезервированным платформой
 * @param {string} okKey - введённый О.К.
 * @returns {boolean} true если зарезервирован
 */
function isReservedOK(okKey) {
  const cleanKey = okKey.replace(/\s+/g, '').trim();
  return RESERVED_OK_KEYS.includes(cleanKey);
}

// Базовые цвета
const BASE_COLORS = {
  RED: 'RED',
  BLUE: 'BLUE',
  GREEN: 'GREEN',
  WHITE: 'WHITE',
  SPECIAL: 'SPECIAL'
};

// Цветовая схема символов (КАНОН v0.3.21)
// RED: Русские уникальные
// BLUE: Латинские уникальные (QZYSUFGJIWVLNR)
// GREEN: Общие буквы (есть в обоих алфавитах) + спецсимвол 𝕯
const CHAR_COLORS = {
  // === РУССКИЕ УНИКАЛЬНЫЕ (КРАСНЫЕ) ===
  'Ё': 'RED', 'Й': 'RED', 'Ц': 'RED', 'У': 'RED', 'К': 'RED', 'Е': 'RED',
  'Н': 'RED', 'Г': 'RED', 'Ш': 'RED', 'Щ': 'RED', 'З': 'RED', 'Х': 'RED',
  'Ъ': 'RED', 'Ф': 'RED', 'Ы': 'RED', 'В': 'RED', 'А': 'RED', 'П': 'RED',
  'Р': 'RED', 'О': 'RED', 'Л': 'RED', 'Д': 'RED', 'Ж': 'RED', 'Э': 'RED',
  'Я': 'RED', 'Ч': 'RED', 'С': 'RED', 'М': 'RED', 'И': 'RED', 'Т': 'RED',
  'Ь': 'RED', 'Б': 'RED', 'Ю': 'RED',
  // === ЛАТИНСКИЕ УНИКАЛЬНЫЕ (СИНИЕ) — только 14 букв ===
  'Q': 'BLUE', 'Z': 'BLUE', 'Y': 'BLUE', 'S': 'BLUE', 'U': 'BLUE',
  'F': 'BLUE', 'G': 'BLUE', 'J': 'BLUE', 'I': 'BLUE', 'W': 'BLUE',
  'V': 'BLUE', 'L': 'BLUE', 'N': 'BLUE', 'R': 'BLUE',
  // === ОБЩИЕ БУКВЫ (ЗЕЛЁНЫЕ) — есть в русском и латинском ===
  'X': 'GREEN', 'C': 'GREEN', 'T': 'GREEN', 'M': 'GREEN', 'O': 'GREEN',
  'A': 'GREEN', 'K': 'GREEN', 'E': 'GREEN', 'B': 'GREEN', 'H': 'GREEN',
  'P': 'GREEN',
  // === СПЕЦИАЛЬНЫЙ СИМВОЛ (ЗЕЛЁНЫЙ) ===
  '𝕯': 'GREEN'
};

// Получить цвет символа
function getCharColor(char) {
  return CHAR_COLORS[char] ?? 'WHITE';
}

// Раскладка клавиатуры из React-версии (с буквой 'В'!)
const KEYBOARD_ROWS_DATA = [
  // Ряд 0: Ё Й цифры Ы Э
  [
    { val: 'Ё', color: BASE_COLORS.RED },
    { val: 'Й', color: BASE_COLORS.RED },
    { val: '8', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '6', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '4', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '2', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '0', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '1', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '3', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '5', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '7', color: BASE_COLORS.WHITE, isDigit: true },
    { val: '9', color: BASE_COLORS.WHITE, isDigit: true },
    { val: 'Ы', color: BASE_COLORS.RED },
    { val: 'Э', color: BASE_COLORS.RED }
  ],
  // Ряд 1: Q X C T 𝕯 M O A K E B H P Ю
  [
    { val: 'Q', color: BASE_COLORS.BLUE },
    { val: 'X', color: BASE_COLORS.GREEN },
    { val: 'C', color: BASE_COLORS.GREEN },
    { val: 'T', color: BASE_COLORS.GREEN },
    { val: '𝕯', color: BASE_COLORS.GREEN, isDouble: true },
    { val: 'M', color: BASE_COLORS.GREEN },
    { val: 'O', color: BASE_COLORS.GREEN },
    { val: 'A', color: BASE_COLORS.GREEN },
    { val: 'K', color: BASE_COLORS.GREEN },
    { val: 'E', color: BASE_COLORS.GREEN },
    { val: 'B', color: BASE_COLORS.GREEN },
    { val: 'H', color: BASE_COLORS.GREEN },
    { val: 'P', color: BASE_COLORS.GREEN },
    { val: 'Ю', color: BASE_COLORS.RED }
  ],
  // Ряд 2: Z Y S U F G J I W V L N R Я
  [
    { val: 'Z', color: BASE_COLORS.BLUE },
    { val: 'Y', color: BASE_COLORS.BLUE },
    { val: 'S', color: BASE_COLORS.BLUE },
    { val: 'U', color: BASE_COLORS.BLUE },
    { val: 'F', color: BASE_COLORS.BLUE },
    { val: 'G', color: BASE_COLORS.BLUE },
    { val: 'J', color: BASE_COLORS.BLUE },
    { val: 'I', color: BASE_COLORS.BLUE },
    { val: 'W', color: BASE_COLORS.BLUE },
    { val: 'V', color: BASE_COLORS.BLUE },
    { val: 'L', color: BASE_COLORS.BLUE },
    { val: 'N', color: BASE_COLORS.BLUE },
    { val: 'R', color: BASE_COLORS.BLUE },
    { val: 'Я', color: BASE_COLORS.RED }
  ],
  // Ряд 3: З Ч Ц У Ф Г Ж И Ш Щ Л Б П Ь/Ъ (без В, используем общую B)
  [
    { val: 'З', color: BASE_COLORS.RED },
    { val: 'Ч', color: BASE_COLORS.RED },
    { val: 'Ц', color: BASE_COLORS.RED },
    { val: 'У', color: BASE_COLORS.RED },
    { val: 'Ф', color: BASE_COLORS.RED },
    { val: 'Г', color: BASE_COLORS.RED },
    { val: 'Ж', color: BASE_COLORS.RED },
    { val: 'И', color: BASE_COLORS.RED },
    { val: 'Ш', color: BASE_COLORS.RED },
    { val: 'Щ', color: BASE_COLORS.RED },
    { val: 'Л', color: BASE_COLORS.RED },
    { val: 'Б', color: BASE_COLORS.RED },
    { val: 'П', color: BASE_COLORS.RED },
    { type: 'split', tl: 'Ь', br: 'Ъ', color: BASE_COLORS.RED }
  ],
  // Ряд 4: Управление + парные символы (React-версия)
  [
    { type: 'func', val: 'delete' },
    { type: 'split', tl: '+', br: '-', color: BASE_COLORS.WHITE },
    { type: 'split', tl: '&', br: '\\', color: BASE_COLORS.WHITE },
    { type: 'split', tl: '(', br: '[', color: BASE_COLORS.WHITE },
    { type: 'split', tl: ';', br: ':', color: BASE_COLORS.WHITE },
    { type: 'split', tl: '?', br: '!', color: BASE_COLORS.WHITE },
    { type: 'func', val: 'space' },
    { type: 'split', tl: '@', br: '#', color: BASE_COLORS.WHITE },
    { type: 'split', tl: '*', br: '/', color: BASE_COLORS.WHITE },
    { type: 'split', tl: ')', br: ']', color: BASE_COLORS.WHITE },
    { type: 'split', tl: '_', br: '=', color: BASE_COLORS.WHITE },
    { type: 'split', tl: ',', br: '.', color: BASE_COLORS.WHITE },
    { type: 'func', val: 'backspace' }
  ]
];

// === СОСТОЯНИЕ ===
const ThresholdState = {
  inputData: [],       // Введённые символы
  rowsOrder: [0, 1, 2, 3],  // Порядок рядов (для drag-and-drop)
  draggedRowIndex: null,
  isComplete: false,
  okKey: ''
};

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Правильный подсчёт длины строки (𝕯 = 1 символ)
function getCorrectLength(str) {
  return [...str].length;
}

// Проверка валидности О.К.
function isValidOK() {
  const text = ThresholdState.inputData.map(i => i.char).join('');
  const length = getCorrectLength(text);
  const hasConsecutiveSpaces = /  +/.test(text);
  const endsWithSpace = text.endsWith(' ');
  const spaceCount = (text.match(/ /g) || []).length;

  return (
    length >= OK_MIN_LENGTH &&
    length <= OK_MAX_LENGTH &&
    !hasConsecutiveSpaces &&
    !endsWithSpace &&
    spaceCount <= MAX_SPACES
  );
}

// === ОТРИСОВКА ===

function renderKeyboard() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;

  let html = '';

  // Легенда (как в React-версии)
  html += `
    <div class="kb-legend">
      <span class="kb-legend-item">
        <span class="kb-legend-dot green"></span> Двойные
      </span>
      <span class="kb-legend-item">
        <span class="kb-legend-dot split"></span> Разделённые
      </span>
      <span class="kb-legend-item">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8L22 12L18 16"/><path d="M6 8L2 12L6 16"/><path d="M2 12H22"/>
        </svg>
        Перетащи ряд
      </span>
    </div>
  `;

  // Ряды 0-3 (перетаскиваемые)
  ThresholdState.rowsOrder.forEach((rowIdx, visualIdx) => {
    const row = KEYBOARD_ROWS_DATA[rowIdx];
    html += `
      <div class="kb-row kb-draggable" draggable="true" data-row="${rowIdx}" data-visual="${visualIdx}">
        <span class="kb-drag-handle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8L22 12L18 16"/><path d="M6 8L2 12L6 16"/><path d="M2 12H22"/>
          </svg>
        </span>
        ${row.map(key => renderKey(key)).join('')}
      </div>
    `;
  });

  // Ряд 4 (фиксированный)
  html += `
    <div class="kb-row kb-fixed" data-row="4">
      ${KEYBOARD_ROWS_DATA[4].map(key => renderKey(key)).join('')}
    </div>
  `;

  keyboard.innerHTML = html;
  setupKeyboardHandlers();
}

function renderKey(key) {
  if (key.type === 'func') {
    if (key.val === 'delete') {
      return `<button class="kb-btn kb-control kb-delete" data-action="delete">DEL</button>`;
    }
    if (key.val === 'backspace') {
      return `<button class="kb-btn kb-control kb-backspace" data-action="backspace">←</button>`;
    }
    if (key.val === 'space') {
      return `<button class="kb-btn kb-control kb-space" data-char=" ">ПРОБЕЛ</button>`;
    }
  }

  if (key.type === 'split') {
    let colorClass = 'kb-num';
    if (key.color === BASE_COLORS.RED) colorClass = 'kb-red';
    if (key.color === BASE_COLORS.BLUE) colorClass = 'kb-blue';
    if (key.color === BASE_COLORS.GREEN) colorClass = 'kb-green';

    return `
      <button class="kb-btn ${colorClass} kb-split" data-char="${key.tl}" data-char-alt="${key.br}">
        <span class="kb-split-tl">${key.tl}</span>
        <span class="kb-split-br">${key.br}</span>
      </button>
    `;
  }

  // Обычная кнопка
  let colorClass = 'kb-num';
  if (key.color === BASE_COLORS.RED) colorClass = 'kb-red';
  if (key.color === BASE_COLORS.BLUE) colorClass = 'kb-blue';
  if (key.color === BASE_COLORS.GREEN) colorClass = 'kb-green';

  return `<button class="kb-btn ${colorClass}" data-char="${key.val}" data-is-double="${key.isDouble || false}">${key.val}</button>`;
}

function updateInputDisplay() {
  const display = document.getElementById('ok-display');
  const lengthCounter = document.getElementById('ok-length');
  const confirmBtn = document.getElementById('confirm-ok-btn');

  if (!display || !lengthCounter) return;

  const inputData = ThresholdState.inputData;
  const text = inputData.map(i => i.char).join('');
  const length = getCorrectLength(text);

  if (length === 0) {
    display.innerHTML = '<span class="ok-display-placeholder">_</span>';
    display.classList.remove('valid', 'invalid');
  } else {
    // Цветовое отображение каждого символа с :: границами
    display.innerHTML = `
      <span class="ok-display-border">::</span>
      ${inputData.map(item => {
        const color = getCharColor(item.char);
        const colorClass = color === 'RED' ? 'ok-display-char-red' :
                           (color === 'BLUE' ? 'ok-display-char-blue' :
                           (color === 'GREEN' ? 'ok-display-char-green' : 'ok-display-char-num'));
        return `<span class="${colorClass}">${item.char}</span>`;
      }).join('')}
      <span class="ok-display-border">::</span>
    `;

    const valid = isValidOK();
    display.classList.toggle('valid', valid);
    display.classList.toggle('invalid', !valid);
  }

  lengthCounter.textContent = `${length} / ${OK_MAX_LENGTH}`;
  lengthCounter.classList.toggle('valid', isValidOK());
  lengthCounter.classList.toggle('warning', !isValidOK() && length > 0);

  // Блокировка кнопки подтверждения
  if (confirmBtn) {
    confirmBtn.disabled = !isValidOK();
  }
}

// === ОБРАБОТЧИКИ КЛАВИАТУРЫ ===

function setupKeyboardHandlers() {
  // Обработка кнопок клавиатуры
  document.querySelectorAll('.kb-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const action = btn.dataset.action;
      const char = btn.dataset.char;
      const altChar = btn.dataset.charAlt;
      const isDouble = btn.dataset.isDouble === 'true';

      if (action === 'delete') {
        ThresholdState.inputData = [];
      } else if (action === 'backspace') {
        ThresholdState.inputData = ThresholdState.inputData.slice(0, -1);
      } else if (char) {
        // Обработка разделённой кнопки (горизонтальное деление: верх = основной, низ = alt)
        if (altChar) {
          const rect = btn.getBoundingClientRect();
          const y = event.clientY - rect.top;

          // Горизонтальный разделитель: верхняя половина = основной символ, нижняя = alt
          const useAlt = y > rect.height / 2;
          handleKeyPress(useAlt ? altChar : char);
        } else {
          handleKeyPress(char);
        }
      }

      updateInputDisplay();
    });
  });

  // Drag-and-drop для рядов
  document.querySelectorAll('.kb-row.kb-draggable').forEach(row => {
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragend', handleDragEnd);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
  });
}

function handleKeyPress(char) {
  const text = ThresholdState.inputData.map(i => i.char).join('');
  const length = getCorrectLength(text);

  if (length >= OK_MAX_LENGTH) return;

  if (char === ' ') {
    if (length === 0) return;  // Не начинать с пробела
    if (text.endsWith(' ')) return;  // Не более 1 пробела подряд
    if ((text.match(/ /g) || []).length >= MAX_SPACES) return;  // Макс 5 пробелов
  }

  const color = getCharColor(char);
  ThresholdState.inputData.push({ char, color });
}

// === DRAG-AND-DROP ===

function handleDragStart(e) {
  const row = e.target.closest('.kb-row');
  ThresholdState.draggedRowIndex = parseInt(row.dataset.visual);
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  const row = e.target.closest('.kb-row');
  row.classList.remove('dragging');
  ThresholdState.draggedRowIndex = null;
  document.querySelectorAll('.kb-row').forEach(r => r.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault();
  const row = e.target.closest('.kb-row');
  if (row && row.classList.contains('kb-draggable')) {
    row.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const row = e.target.closest('.kb-row');
  if (row) row.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  const targetRow = e.target.closest('.kb-row.kb-draggable');
  if (!targetRow) return;

  const targetIdx = parseInt(targetRow.dataset.visual);

  if (ThresholdState.draggedRowIndex !== null && ThresholdState.draggedRowIndex !== targetIdx) {
    const newOrder = [...ThresholdState.rowsOrder];
    const draggedRow = newOrder[ThresholdState.draggedRowIndex];
    newOrder.splice(ThresholdState.draggedRowIndex, 1);
    newOrder.splice(targetIdx, 0, draggedRow);
    ThresholdState.rowsOrder = newOrder;

    renderKeyboard();
  }
}

// === ПОДТВЕРЖДЕНИЕ О.К. ===

function confirmOK() {
  const text = ThresholdState.inputData.map(i => i.char).join('').trim();
  const length = getCorrectLength(text);

  if (length < OK_MIN_LENGTH || length > OK_MAX_LENGTH) {
    const msg = I18N.t('th_alert_ok_length')
      .replace('{min}', OK_MIN_LENGTH)
      .replace('{max}', OK_MAX_LENGTH);
    alert(msg);
    return;
  }

  // === v0.3.23: Проверка резерва ключей ::0::-::33:: ===
  if (isReservedOK(text)) {
    showToast('⚠️ Этот О.К. зарезервирован для нужд платформы (Орден ::01::). Пожалуйста, выберите другой.', 'error');
    console.warn(`[Порог] Попытка использовать зарезервированный О.К.: "${text}"`);
    return;
  }

  // Сохранение О.К.
  localStorage.setItem('pygmalion_ok_key', text);
  localStorage.setItem('pygmalion_ok_created', new Date().toISOString());

  // Проверка сохранения
  const saved = localStorage.getItem('pygmalion_ok_key');
  console.log(`[Порог] О.К. сохранён: ${text}`);
  console.log(`[Порог] Проверка чтения: ${saved}`);
  console.log(`[Порог] Совпадает: ${saved === text}`);

  ThresholdState.okKey = text;
  ThresholdState.isComplete = true;

  console.log(`[Порог] О.К. создан: ${text.substring(0, 3)}... (${length} символов)`);

  // Перенаправление в песочницу
  showToast('О.К. принят! Переход в песочницу...', 'success');
  setTimeout(() => {
    console.log('[Порог] Редирект на index.html');
    window.location.replace('index.html');
  }, 1500);
}

// === УВЕДОМЛЕНИЯ ===

function showToast(message, type = 'info') {
  const existingToast = document.getElementById('toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;

  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      #toast-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: toastSlideIn 0.3s ease-out;
      }
      .toast-success { background: #22c55e; }
      .toast-error { background: #ef4444; }
      .toast-info { background: #3b82f6; }
      @keyframes toastSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);

  console.log(`[${type.toUpperCase()}] ${message}`);
}

// === ПУТЕВОЙ КАМЕНЬ ===

function initWaystone() {
  const overlay = document.getElementById('waystone-overlay');
  const enterBtn = document.getElementById('path-enter-btn');
  const exitBtn = document.getElementById('path-exit-btn');
  const thresholdContainer = document.getElementById('threshold-container');

  // DEV-режим: threshold.html?dev — редирект не происходит
  const isDevMode = new URLSearchParams(window.location.search).has('dev');

  // Проверка: если О.К. уже создан
  const savedOK = localStorage.getItem('pygmalion_ok_key');
  if (savedOK && getCorrectLength(savedOK) >= OK_MIN_LENGTH) {
    ThresholdState.okKey = savedOK;
    ThresholdState.isComplete = true;

    if (isDevMode) {
      console.log('[Dev] О.К. существует:', savedOK, '— редирект пропущен');
      const devNotice = document.createElement('div');
      devNotice.style.cssText = 'position:fixed;top:12px;right:12px;background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;z-index:9999;font-family:monospace;';
      devNotice.innerHTML = 'DEV &middot; О.К.: <b>' + savedOK.slice(0, 10) + '&hellip;</b>';
      document.body.appendChild(devNotice);
    } else {
      window.location.replace('index.html');
      return;
    }
  }

  // Вход в ЧисСлоБукВ
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
        thresholdContainer.style.display = 'flex';
        renderKeyboard();
        updateInputDisplay();
      }, 1000);
    });
  }

  // Выход (налево)
  const pathLeftExitBtn = document.getElementById('path-left-exit-btn');
  if (pathLeftExitBtn) {
    pathLeftExitBtn.addEventListener('click', () => {
      if (confirm(I18N.t('th_alert_left_exit'))) {
        window.close();
        window.location.href = 'https://google.com';
      }
    });
  }

  // Выход (направо)
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      if (confirm(I18N.t('th_alert_right_exit'))) {
        window.close();
        window.location.href = 'https://google.com';
      }
    });
  }
}

// === ИНИЦИАЛИЗАЦИЯ ===

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Порог] ЧисСлоБукВ (React-версия) инициализирован');
  initWaystone();

  // Кнопка подтверждения
  const confirmBtn = document.getElementById('confirm-ok-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmOK);
  }

  // Кнопка копирования О.К.
  const copyBtn = document.getElementById('btn-copy-ok');
  const copyFeedback = document.getElementById('copy-feedback');
  if (copyBtn && copyFeedback) {
    copyBtn.addEventListener('click', async () => {
      const text = ThresholdState.inputData.map(i => i.char).join('');
      if (text.length === 0) {
        alert(I18N.t('th_alert_enter_ok_first'));
        return;
      }

      const textWithBoundaries = `::${text}::`;

      try {
        await navigator.clipboard.writeText(textWithBoundaries);
        copyFeedback.classList.add('show');
        setTimeout(() => copyFeedback.classList.remove('show'), 2000);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = textWithBoundaries;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyFeedback.classList.add('show');
        setTimeout(() => copyFeedback.classList.remove('show'), 2000);
      }
    });
  }

  // Экспорт для отладки
  window.PygmalionThreshold = {
    state: ThresholdState,
    confirmOK,
    getCorrectLength,
    isValidOK,
    resetOKKey: () => {
      localStorage.removeItem('pygmalion_ok_key');
      ThresholdState.inputData = [];
      ThresholdState.isComplete = false;
      updateInputDisplay();
      console.log('[Dev] О.К. сброшен для нового ввода');
    }
  };
});
