/**
 * ========================================
 * ПИГМАЛИОН — Оффлайн логика
 * Версия: 1.1 (Fixed)
 * Все комментарии на русском
 * ========================================
 */

// === ГЛОБАЛЬНЫЕ КОНСТАНТЫ ===

// Максимальная длина О.К.
const MAX_OK_LENGTH = 70;
const MIN_OK_LENGTH = 3;
const MAX_SPACES = 5;

// Цвета клавиш
const KEY_COLORS = {
    RED: 'RED',
    BLUE: 'BLUE',
    GREEN: 'GREEN',
    WHITE: 'WHITE',
    SPECIAL: 'SPECIAL'
};

// Триады У.Е.
const TRIADS = {
    T1: { name: 'Знания', color: '#ef4444', range: [1, 2, 3] },
    T2: { name: 'Практики', color: '#facc15', range: [4, 5, 6] },
    T3: { name: 'Творчество', color: '#22c55e', range: [7, 8, 9] },
    T4: { name: 'Досуг/ЗОЖ', color: '#3b82f6', range: [10, 11, 12] },
    T5: { name: '№21', color: '#a855f7', range: [21] }
};
function getTriadIcon(key) {
    const icons = {
        T1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', // Книга
        T2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 3v7h7l-8 12v-9H5l8-10z"/></svg>', // Молния
        T3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 2.5-1.5"/></svg>', // Палитра
        T4: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>', // Кофе
        T5: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' // Звезда
    };
    return icons[key] || '';
}

// Сценарии эмиссии (№1-8)
const SCENARIOS = [
    { id: 1, total: 52, perParticipant: 13, desc: '52 У.Е. по 13' },
    { id: 2, total: 48, perParticipant: 12, desc: '48 У.Е. по 12' },
    { id: 3, total: 40, perParticipant: 10, desc: '40 У.Е. по 10' },
    { id: 4, total: 36, perParticipant: 9, desc: '36 У.Е. по 9' },
    { id: 5, total: 28, perParticipant: 7, desc: '28 У.Е. по 7' },
    { id: 6, total: 24, perParticipant: 6, desc: '24 У.Е. по 6' },
    { id: 7, total: 16, perParticipant: 4, desc: '16 У.Е. по 4' },
    { id: 8, total: 12, perParticipant: 3, desc: '12 У.Е. по 3' }
];

// Участники
const PARTICIPANTS = [
    { id: '1', name: 'Уч.1', label: 'Вы' },
    { id: '2', name: 'Уч.2', label: 'Собеседник 2' },
    { id: '3', name: 'Уч.3', label: 'Собеседник 3' },
    { id: '4', name: 'Уч.4', label: 'Собеседник 4' },
    { id: '5', name: 'Уч.5', label: 'Все люди (Мир)' }
];

// Раскладка клавиатуры "ЧисСлоБукВ" v.0.1.7
const KEYBOARD_ROWS = [
    // Ряд 0: Цифры + буквы
    [
        { val: 'Ё', color: 'RED' }, { val: 'Й', color: 'RED' },
        { val: '8', color: 'WHITE', isDigit: true }, { val: '6', color: 'WHITE', isDigit: true },
        { val: '4', color: 'WHITE', isDigit: true }, { val: '2', color: 'WHITE', isDigit: true },
        { val: '0', color: 'WHITE', isDigit: true }, { val: '1', color: 'WHITE', isDigit: true },
        { val: '3', color: 'WHITE', isDigit: true }, { val: '5', color: 'WHITE', isDigit: true },
        { val: '7', color: 'WHITE', isDigit: true }, { val: '9', color: 'WHITE', isDigit: true },
        { val: 'Ы', color: 'RED' }, { val: 'Э', color: 'RED' }
    ],
    // Ряд 1: Латиница + кириллица
    [
        { val: 'Q', color: 'BLUE' }, { val: 'X', color: 'GREEN' },
        { val: 'C', color: 'GREEN' }, { val: 'T', color: 'GREEN' },
        { val: '\u{1D56F}', color: 'GREEN', isDouble: true }, { val: 'M', color: 'GREEN' },
        { val: 'O', color: 'GREEN' }, { val: 'A', color: 'GREEN' },
        { val: 'K', color: 'GREEN' }, { val: 'E', color: 'GREEN' },
        { val: 'B', color: 'GREEN' }, { val: 'H', color: 'GREEN' },
        { val: 'P', color: 'GREEN' }, { val: 'Ю', color: 'RED' }
    ],
    // Ряд 2: Латиница
    [
        { val: 'Z', color: 'BLUE' }, { val: 'Y', color: 'BLUE' },
        { val: 'S', color: 'BLUE' }, { val: 'U', color: 'BLUE' },
        { val: 'F', color: 'BLUE' }, { val: 'G', color: 'BLUE' },
        { val: 'J', color: 'BLUE' }, { val: 'I', color: 'BLUE' },
        { val: 'W', color: 'BLUE' }, { val: 'V', color: 'BLUE' },
        { val: 'L', color: 'BLUE' }, { val: 'N', color: 'BLUE' },
        { val: 'R', color: 'BLUE' }, { val: 'Я', color: 'RED' }
    ],
    // Ряд 3: Кириллица
    [
        { val: 'З', color: 'RED' }, { val: 'Ч', color: 'RED' },
        { val: 'Ц', color: 'RED' }, { val: 'У', color: 'RED' },
        { val: 'Ф', color: 'RED' }, { val: 'Г', color: 'RED' },
        { val: 'Ж', color: 'RED' }, { val: 'И', color: 'RED' },
        { val: 'Ш', color: 'RED' }, { val: 'Щ', color: 'RED' },
        { val: 'Л', color: 'RED' }, { val: 'Б', color: 'RED' },
        { val: 'П', color: 'RED' }, { val: 'Ь', color: 'RED' }, { val: 'Ъ', color: 'RED' }
    ],
    // Ряд 4: Спецсимволы (фиксированный)
    [
        { val: 'delete', type: 'func' },
        { val: '+', color: 'WHITE', isDigit: true }, { val: '|', color: 'WHITE', isDigit: true },
        { val: '(', color: 'WHITE', isDigit: true }, { val: ';', color: 'WHITE', isDigit: true },
        { val: '!', color: 'WHITE', isDigit: true },
        { val: ' ', type: 'space' },
        { val: '@', color: 'WHITE', isDigit: true }, { val: '*', color: 'WHITE', isDigit: true },
        { val: ')', color: 'WHITE', isDigit: true }, { val: '_', color: 'WHITE', isDigit: true },
        { val: ',', color: 'WHITE', isDigit: true },
        { val: 'backspace', type: 'func' }
    ]
];

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let state = {
    currentStage: 0, // Текущий экран (0-6)
    okKey: '', // Открытый Ключик пользователя
    inputData: [], // Массив введённых символов с цветами
    rowsOrder: [0, 1, 2, 3], // Порядок рядов клавиатуры (без 5-го)
    draggedRowIndex: null, // Индекс перетаскиваемого ряда
    
    // Эмиссия
    activeParticipant: 0, // Индекс активного участника (0-3)
    participantSelections: { 1: [], 2: [], 3: [], 4: [] }, // Выбранные триады
    selectedScenario: null, // Выбранный сценарий
    
    // Перекидка
    units: [], // Массив У.Е. (в инвентаре)
    receivedUnits: [], // Массив ПОЛУЧЕННЫХ У.Е. (в копилке)
    transactions: [], // Лог транзакций
    draggedUE: null, // Перетаскиваемая У.Е.
    
    // Возврат
    returnAttempts: 0, // Попытки возврата (макс 3)
    violations: [], // Нарушения нормы
    
    // Результаты
    gameHistory: [], // История конов
    currentKon: 0, // Номер текущего кона
    
    // Музыка
    musicEnabled: false,
    musicFile: null
};

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Получить DOM элемент
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Загрузка из localStorage
function loadState() {
    try {
        const saved = localStorage.getItem('pigmalion_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            // Инициализируем receivedUnits, если загрузились старые данные без него
            if (!state.receivedUnits) state.receivedUnits = [];
        }
    } catch (e) {
        console.warn('Ошибка загрузки состояния:', e);
    }
}

// Сохранение в localStorage
function saveState() {
    try {
        localStorage.setItem('pigmalion_state', JSON.stringify(state));
    } catch (e) {
        console.warn('Ошибка сохранения состояния:', e);
    }
}

// Создать SVG иконку
function icon(name, size = 20) {
    const icons = {
        music: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        info: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        sparkles: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
        delete: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
        backspace: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="m18 9-6 6"/><path d="m12 9 6 6"/></svg>`,
        move: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8L22 12L18 16"/><path d="M6 8L2 12L6 16"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
        check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        sun: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
        clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
        refresh: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
        trendUp: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
        trendDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
        phone: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>`,
        mail: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
    };
    return icons[name] || '';
}

// Показать уведомление (тост)
function toast(message, type = 'info') {
    const existing = $('.toast');
    if (existing) existing.remove();
    
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.75rem 1.5rem;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
        color: white;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        z-index: 2000;
        animation: fade-in 0.2s ease;
    `;
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    
    setTimeout(() => toastEl.remove(), 3000);
}

// === РЕНДЕРИНГ ЭКРАНОВ ===

// Главная функция рендера
function render() {
    const app = $('#app');
    
    switch (state.currentStage) {
        case 0:
            renderIntro(app);
            break;
        case 1:
            renderKeyboard(app);
            break;
        case 2:
            renderEmission(app);
            break;
        case 3:
            renderTransfer(app);
            break;
        case 4:
            renderReturn(app);
            break;
        case 5:
            renderResults(app);
            break;
        case 6:
            renderContacts(app);
            break;
        default:
            renderIntro(app);
    }
    
    saveState();
}

// === ЭКРАН 0.0: ЗАСТАВКА ===
function renderIntro(container) {
    container.innerHTML = `
        <div class="screen screen-center">
            <!-- Верхняя панель: Музыка слева, Инфо справа -->
            <div class="top-bar">
                <button class="btn btn-icon btn-secondary" id="btnMusic" title="Загрузить музыку">
                    ${icon('music')}
                </button>
                <button class="btn btn-icon btn-secondary" id="btnInfo" title="Информация">
                    ${icon('info')}
                </button>
            </div>
            
            <!-- Священная геометрия (Цветок жизни) -->
            <div class="sacred-geometry mb-8">
                ${Array.from({ length: 7 }).map((_, i) => `
                    <div class="sacred-circle" style="transform: rotate(${i * 60}deg) translate(40px) rotate(-${i * 60}deg);"></div>
                `).join('')}
                <div class="sacred-center"></div>
                <div class="sacred-icon">${icon('sparkles', 32)}</div>
            </div>
            
            <!-- Заголовок -->
            <h1 class="text-4xl text-gradient mb-2">ПИГМАЛИОН</h1>
            <p class="text-secondary text-lg mb-2">Технология «ТУТумУЕ» от Человека к Человеку</p>
                        
            <!-- Кнопка старта -->
            <button class="btn btn-success btn-lg" id="btnStart">
                ▶ ${state.okKey ? 'Начать демонстрацию' : 'Придумать О.К.'}
            </button>
			<p class="text-muted text-sm mb-8" style="max-width: 400px; text-align: center;">
                НОД.-платформа нашего "числового сдерживания" и обмена ценностями.
            </p>
        </div>
    `;
    
    $('#btnStart').onclick = () => {
        if (state.okKey) {
            state.currentStage = 2; // Сразу к эмиссии если О.К. есть
        } else {
            state.currentStage = 1; // К клавиатуре
        }
        render();
    };
    
    $('#btnMusic').onclick = openMusicDialog;
    $('#btnInfo').onclick = openInfoModal;
}

// Диалог загрузки музыки
function openMusicDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const audio = $('#bgMusic');
            audio.src = URL.createObjectURL(file);
            audio.play();
            state.musicEnabled = true;
            toast('Музыка загружена', 'success');
        }
    };
    input.click();
}

// Модальное окно информации
function openInfoModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal info-modal">
								
            <h2 class="modal-title text-gradient">"i" информер. Для ВСЕХ !!</h2>
            <h3>Цель платформы</h3>
            <p>"Механика ежедневного поЛУЧения и приМЕНение «Учётной единицы» У.Е. по своему желанию. Альтернатива для 7 го тех.уклада мир. Ноономики"</p>
                        <h3>Участники</h3>
            <ul>
                <li><b>Уч.1 (Вы)</b> — Организатор с уникальным О.К.</li>
                <li><b>Уч.2-4</b> — Собеседники</li>
                <li><b>Уч.5</b> — Все люди</li>
            </ul>
            
            <h3>У.Е. - "Учётные Единицы"</h3>
            <p>Каждый день участники заказывают сами себе от 3 до 13 У.Е. из 4 триад:</p>
            <ul>
                <li style="color: var(--triad-red);">Знания: 1-3</li>
                <li style="color: var(--triad-yellow);">Практики: 4-6</li>
                <li style="color: var(--triad-green);">Творчество: 7-9</li>
                <li style="color: var(--triad-blue);">Досуг/ЗОЖ: 10-12</li>
                <li style="color: var(--triad-purple);">Безопасность №21</li>
            </ul>
            <h3>Рекомендация нормы</h3>
            <p>Получатель не сможет принять более 1 У.Е. из каждой триады от отправителя за кон. (не более 5 у.е. от каждого за день)</p>
            
                       <h3>Подвидение итого и "Шкала Духовности"</h3>
            <p><b>(Отдал × 2) + (Принял × 1) - (Сгорело × 1)</b></p>
            <div class="modal-actions mt-6">
                <button class="btn btn-primary" id="closeInfoModal">Понятно</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.onclick = (e) => {
        if (e.target === modal || e.target.id === 'closeInfoModal') {
            modal.remove();
        }
    };
}

// === ЭКРАН 1.0: КЛАВИАТУРА "ЧисСлоБукВ" ===
function renderKeyboard(container) {
    container.innerHTML = `
        <div class="screen">
            <h1 class="text-3xl text-gradient mb-2">ЧисСлоБукВ - Акт 1.0.</h1>
            
            <div class="input-display mb-2 w-full" style="max-width: 600px;" id="inputDisplay">
                ${state.inputData.length === 0 
                    ? '<span class="input-placeholder">Придумайте свой „О.К." — Открытый Ключик</span>' 
                    : renderInputChars()}
            </div>
            
            <div class="text-sm text-muted mb-4">
                ${state.inputData.length} / ${MAX_OK_LENGTH} символов
            </div>
            
            <div class="keyboard-container mb-6" id="keyboard">
                ${renderKeyboardRows()}
            </div>
            
            <button class="btn btn-success btn-lg" id="btnAcceptOK">
                ${icon('check')} Принять О.К.
            </button>
        </div>
    `;
    setupKeyboardHandlers();
}

function renderInputChars() {
    return '::' + state.inputData.map(item => {
        let colorClass = 'color: var(--text-primary)';
        if (item.color === 'RED') colorClass = 'color: var(--triad-red)';
        if (item.color === 'BLUE') colorClass = 'color: var(--triad-blue)';
        if (item.color === 'GREEN') colorClass = 'color: var(--triad-green)';
        return `<span style="${colorClass}">${item.char}</span>`;
    }).join('') + '::';
}

function renderKeyboardRows() {
    let html = '';
    state.rowsOrder.forEach((rowIdx, visualIdx) => {
        const row = KEYBOARD_ROWS[rowIdx];
        html += `
            <div class="keyboard-row" draggable="true" data-row="${rowIdx}" data-visual="${visualIdx}">
                <span class="text-muted" style="cursor: grab; margin-right: 0.5rem;">${icon('move', 16)}</span>
                ${row.map(key => renderKey(key)).join('')}
            </div>
        `;
    });
    html += `
        <div class="keyboard-row fixed" data-row="4">
            ${KEYBOARD_ROWS[4].map(key => renderKey(key)).join('')}
        </div>
    `;
    return html;
}

function renderKey(key) {
    if (key.type === 'func') {
        return `<button class="key key-func" data-action="${key.val}">${key.val === 'delete' ? icon('delete', 16) : icon('backspace', 16)}</button>`;
    }
    if (key.type === 'space') {
        return `<button class="key key-space" data-char=" ">ПРОБЕЛ</button>`;
    }
    let colorClass = 'key-white';
    if (key.color === 'RED') colorClass = 'key-red';
    if (key.color === 'BLUE') colorClass = 'key-blue';
    if (key.color === 'GREEN') colorClass = 'key-green';
    if (key.isDigit) colorClass = 'key-white';
    
    return `<button class="key ${colorClass}" data-char="${key.val}" data-color="${key.color || 'WHITE'}">${key.val}</button>`;
}

function setupKeyboardHandlers() {
    $$('.key').forEach(key => {
        key.onclick = () => {
            const action = key.dataset.action;
            const char = key.dataset.char;
            const color = key.dataset.color || 'WHITE';
            
            if (action === 'delete') state.inputData = [];
            else if (action === 'backspace') state.inputData = state.inputData.slice(0, -1);
            else if (char) handleKeyPress(char, color);
            
            updateInputDisplay();
        };
    });
    
    const rows = $$('.keyboard-row[draggable="true"]');
    rows.forEach(row => {
        row.ondragstart = () => { state.draggedRowIndex = parseInt(row.dataset.visual); row.classList.add('dragging'); };
        row.ondragend = () => { row.classList.remove('dragging'); state.draggedRowIndex = null; $$('.keyboard-row').forEach(r => r.classList.remove('drag-over')); };
        row.ondragover = (e) => { e.preventDefault(); row.classList.add('drag-over'); };
        row.ondragleave = () => { row.classList.remove('drag-over'); };
        row.ondrop = (e) => {
            e.preventDefault();
            const targetIdx = parseInt(row.dataset.visual);
            if (state.draggedRowIndex !== null && state.draggedRowIndex !== targetIdx) {
                const newOrder = [...state.rowsOrder];
                const draggedRow = newOrder[state.draggedRowIndex];
                newOrder.splice(state.draggedRowIndex, 1);
                newOrder.splice(targetIdx, 0, draggedRow);
                state.rowsOrder = newOrder;
                $('#keyboard').innerHTML = renderKeyboardRows();
                setupKeyboardHandlers();
            }
        };
    });
    
    $('#btnAcceptOK').onclick = acceptOK;
}

function handleKeyPress(char, color) {
    if (state.inputData.length >= MAX_OK_LENGTH) return;
    const currentText = state.inputData.map(i => i.char).join('');
    if (char === ' ') {
        if (state.inputData.length === 0) return;
        if (currentText.endsWith(' ')) return;
        if ((currentText.match(/ /g) || []).length >= MAX_SPACES) return;
    }
    state.inputData.push({ char, color });
}

function updateInputDisplay() {
    const display = $('#inputDisplay');
    if (!display) return;
    if (state.inputData.length === 0) {
        display.innerHTML = '<span class="input-placeholder">Придумайте свой „О.К." — Открытый Ключик</span>';
        display.classList.remove('valid', 'invalid');
    } else {
        display.innerHTML = renderInputChars();
        const text = state.inputData.map(i => i.char).join('');
        const isValid = text.trim().length >= MIN_OK_LENGTH && text.length <= MAX_OK_LENGTH && !/  +/.test(text) && !text.endsWith(' ');
        display.classList.toggle('valid', isValid);
        display.classList.toggle('invalid', !isValid);
    }
    $('.text-sm.text-muted').textContent = `${state.inputData.length} / ${MAX_OK_LENGTH} символов`;
}

function acceptOK() {
    const text = state.inputData.map(i => i.char).join('').trim();
    if (text.length < MIN_OK_LENGTH || text.length > MAX_OK_LENGTH) { toast(`Длина от ${MIN_OK_LENGTH} до ${MAX_OK_LENGTH}`, 'error'); return; }
    state.okKey = text;
    toast('Ваш О.К. принят!', 'success');
    state.currentStage = 2;
    render();
}

// === ЭКРАН 2.0: ЭМИССИЯ ===
function renderEmission(container) {
    const participant = PARTICIPANTS[state.activeParticipant];
    const selections = state.participantSelections[participant.id] || [];
    const ueCount = calculateUECount(selections);
    
    container.innerHTML = `
        <div class="screen">
            <h1 class="text-2xl text-gradient mb-2">Эмиссия — Акт 2.0</h1>
            <p class="text-muted text-sm mb-4">Организатор: <span class="text-primary">::${state.okKey}::</span></p>
            
            <div class="progress-dots mb-4">
                ${PARTICIPANTS.slice(0, 4).map((p, idx) => `
                    <div class="progress-dot ${idx === state.activeParticipant ? 'active' : (state.participantSelections[p.id]?.length > 0 ? 'done' : '')}"></div>
                `).join('')}
            </div>
            
            <h2 class="text-lg mb-2">${participant.name} <span class="text-muted">(${participant.label})</span></h2>
            <p class="text-sm mb-4">Выбрано У.Е.: <span class="${ueCount >= 3 && ueCount <= 13 ? 'text-success' : 'text-danger'}">${ueCount}</span> / 3-13</p>
            
            <div class="scenarios-grid mb-4">
                ${SCENARIOS.map(s => `
                    <button class="scenario-btn ${state.selectedScenario === s.id ? 'active' : ''}" data-scenario="${s.id}">№${s.id}: ${s.perParticipant} У.Е.</button>
                `).join('')}
            </div>
            
            <div class="triad-grid mb-6">
                ${Object.entries(TRIADS).map(([key, val]) => {
                    const isSelected = selections.includes(key);
                    return `
                        <div class="triad-card ${isSelected ? 'selected' : ''}" data-triad="${key}">
                            <div class="triad-name" style="color: ${val.color}">${val.name}</div>
                            <div class="triad-count">${key === 'T5' ? '1 У.Е.' : '3 У.Е.'}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="flex gap-4">
                ${state.activeParticipant > 0 ? `<button class="btn btn-secondary" id="btnPrevParticipant">← Назад</button>` : ''}
                <button class="btn btn-primary" id="btnNextParticipant">
                    ${state.activeParticipant < 3 ? 'Следующий участник →' : 'Завершить эмиссию ✓'}
                </button>
            </div>
            
            <button class="btn btn-secondary mt-4" id="btnSkipParticipant">Переход хода (0 У.Е.)</button>
        </div>
    `;
    setupEmissionHandlers();
}

function calculateUECount(selections) {
    let count = 0;
    selections.forEach(s => { count += s === 'T5' ? 1 : 3; });
    return count;
}

function setupEmissionHandlers() {
    $$('.scenario-btn').forEach(btn => {
        btn.onclick = () => {
            const scenarioId = parseInt(btn.dataset.scenario);
            state.selectedScenario = scenarioId;
            const scenario = SCENARIOS.find(s => s.id === scenarioId);
            applyScenario(scenario);
            render();
        };
    });
    
    $$('.triad-card').forEach(card => {
        card.onclick = () => {
            const triad = card.dataset.triad;
            const pId = PARTICIPANTS[state.activeParticipant].id;
            const sel = state.participantSelections[pId] || [];
            state.participantSelections[pId] = sel.includes(triad) ? sel.filter(t => t !== triad) : [...sel, triad];
            state.selectedScenario = null;
            render();
        };
    });
    
    if ($('#btnPrevParticipant')) $('#btnPrevParticipant').onclick = () => { state.activeParticipant--; render(); };
    
    $('#btnNextParticipant').onclick = () => {
        const pId = PARTICIPANTS[state.activeParticipant].id;
        const sel = state.participantSelections[pId] || [];
        const ueCount = calculateUECount(sel);
        
        if (sel.length === 1 && sel[0] === 'T5') { toast('Нельзя только №21', 'error'); return; }
        if (sel.length > 0 && (ueCount < 3 || ueCount > 13)) { toast('От 3 до 13 У.Е.', 'error'); return; }
        
        if (state.activeParticipant < 3) {
            state.activeParticipant++;
            render();
        } else {
            generateUnits();
            state.currentStage = 3;
            render();
        }
    };
    
    $('#btnSkipParticipant').onclick = () => {
        state.participantSelections[PARTICIPANTS[state.activeParticipant].id] = [];
        if (state.activeParticipant < 3) {
            state.activeParticipant++;
            render();
        } else {
            generateUnits();
            state.currentStage = 3;
            render();
        }
    };
}

function applyScenario(scenario) {
    const triadsForCount = {
        13: ['T1', 'T2', 'T3', 'T4', 'T5'],
        12: ['T1', 'T2', 'T3', 'T4'],
        10: ['T1', 'T2', 'T3', 'T5'],
        9:  ['T1', 'T2', 'T3'],
        7:  ['T1', 'T2', 'T5'],
        6:  ['T1', 'T2'],
        4:  ['T1', 'T5'],
        3:  ['T1']
    };
    const triads = triadsForCount[scenario.perParticipant] || ['T1'];
    [1, 2, 3, 4].forEach(id => { state.participantSelections[id] = [...triads]; });
}

// Генерация У.Е. на основе выбранных триад
function generateUnits() {
    state.units = [];
    state.receivedUnits = []; // Инициализация массива полученных У.Е.
    
    [1, 2, 3, 4].forEach(participantId => {
        const selections = state.participantSelections[participantId] || [];
        
        selections.forEach(triadKey => {
            const triad = TRIADS[triadKey];
            triad.range.forEach(num => {
                state.units.push({
                    id: `${triadKey}_${num}_p${participantId}`,
                    triad: triadKey,
                    number: num,
                    color: triad.color,
                    owner: String(participantId),
                    to: null
                });
            });
        });
    });
    
    state.transactions = [];
}

// === ЭКРАН 3.0: ПЕРЕКИДКА ===
function renderTransfer(container) {
    container.innerHTML = `
        <div class="screen">
            <h1 class="text-2xl text-gradient mb-2">Акт 3.0 — Перекидка</h1>
            <p class="text-muted text-sm mb-6">Перетащите У.Е. между участниками</p>
            
            <div class="arena mb-4" id="arena">
                ${renderArena()}
            </div>
            
            <div class="registry mb-6">
                <div class="registry-title">Реестр передач (${state.transactions.length})</div>
                ${state.transactions.length === 0 
                    ? '<p class="text-muted text-xs">Перетащите У.Е. между участниками</p>'
                    : state.transactions.map(t => `
                        <div class="registry-item" style="color: ${TRIADS[t.triad].color};">
                            Уч.${t.from} → Уч.${t.to} — ${TRIADS[t.triad].name} №${t.number}
                        </div>
                    `).join('')
                }
            </div>
            
            <div class="flex gap-4">
                <button class="btn btn-secondary" id="btnBackToEmission">← К эмиссии</button>
                <button class="btn btn-primary" id="btnFinishTransfer">
                    Завершить → Акт 3.5
                </button>
            </div>
        </div>
    `;
    setupTransferHandlers();
}

function renderArena() {
    let html = '';

    // уч.5 правее уч.4 (рядом, не в центре)
    html += `
        <div class="participant" style="position: absolute; top: 50%; right: -20%; transform: translateY(-50%);">
            <div class="participant-card" id="dropZone5">
                <div class="participant-name" style="color: var(--triad-purple);">Уч.5</div>
                <div class="text-xs text-muted">Все люди</div>
                <div class="participant-inventory">
                    ${renderParticipantUnits('5')}
                </div>
            </div>
        </div>
    `;

    // Позиции уч.1–4 (уч.4 отодвинут левее для места уч.5)
    const positions = [
        { top: '5%', left: '50%', transform: 'translateX(-50%)' }, // уч.3 выше
        { top: '50%', right: '9%', transform: 'translateY(-50%)' }, // уч.4 левее уч.5
        { bottom: '5%', left: '50%', transform: 'translateX(-50%)' }, // уч.1 ниже
        { top: '50%', left: '9%', transform: 'translateY(-50%)' } // уч.2 лево
    ];

    const order = [3, 4, 1, 2]; // порядок рендера

    order.forEach((pId, idx) => {
        const pos = positions[idx];
        const style = Object.entries(pos).map(([k, v]) => `${k}: ${v}`).join('; ');
        
        html += `
            <div class="participant" style="position: absolute; ${style}">
                <div class="participant-card" id="dropZone${pId}">
                    <div class="participant-name">Уч.${pId}</div>
                    <div class="participant-inventory">
                        ${renderParticipantUnits(String(pId))}
                    </div>
                </div>
            </div>
        `;
    });

    return html;
}

function renderParticipantUnits(ownerId) {
    const units = state.units.filter(u => u.owner === ownerId);
    
    if (units.length === 0) {
        return '<span class="text-muted text-xs">—</span>';
    }
    
    // Группируем по триаде
    const grouped = {};
    units.forEach(u => {
        if (!grouped[u.triad]) grouped[u.triad] = [];
        grouped[u.triad].push(u);
    });
    
    if (units.length === 0) {
        return '<span class="text-muted text-xs">—</span>';
    }
    
    return units.map(u => {
        const triadInfo = TRIADS[u.triad];
       
 	   // SVG-иконки (работают всегда)
        let iconSvg = '';
        if (u.triad === 'T1') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM12 20a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>'; // Книга (Знания)
        if (u.triad === 'T2') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3v7h7l-8 12v-9H5l8-10z"/></svg>'; // Молния (Практики)
        if (u.triad === 'T3') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM10 17l5-5-5-5v10z"/></svg>'; // Палитра (Творчество)
        if (u.triad === 'T4') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'; // Кофе (Досуг)
        if (u.triad === 'T5') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'; // Звезда (№21)
        
        return `
            <div class="ue" 
                 draggable="true" 
                 data-ue-id="${u.id}"
                 style="background: ${triadInfo.color}; cursor: grab;"
                 title="${triadInfo.name}">
                ${iconSvg}
            </div>
        `;
    }).join('');
}   


function setupTransferHandlers() {
    $$('.ue').forEach(ue => {
        ue.ondragstart = (e) => {
            const ueId = ue.dataset.ueId;
            state.draggedUE = state.units.find(u => u.id === ueId);
            ue.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };
        ue.ondragend = () => { ue.classList.remove('dragging'); state.draggedUE = null; };
    });
    
    $$('[id^="dropZone"]').forEach(zone => {
        zone.ondragover = (e) => { e.preventDefault(); zone.style.boxShadow = '0 0 20px var(--accent-primary)'; };
        zone.ondragleave = () => { zone.style.boxShadow = ''; };
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.style.boxShadow = '';
            const targetId = zone.id.replace('dropZone', '');
            if (state.draggedUE && state.draggedUE.owner !== targetId) {
                showTransferConfirm(state.draggedUE, targetId);
            }
        };
    });
    
    $('#btnBackToEmission').onclick = () => { state.currentStage = 2; render(); };
    
    $('#btnFinishTransfer').onclick = () => {
        const violations = checkNormViolations();
        
        if (violations.length > 0) {
            state.violations = violations;
            state.returnAttempts++; // Увеличиваем счетчик
            
            if (state.returnAttempts >= 3) {
                toast('Лимит попыток (3/3) исчерпан. Переход к итогам.', 'warning');
                state.currentStage = 5; // Сразу к итогам
            } else {
                state.currentStage = 4; // К мягкому возврату
                toast('Обнаружены нарушения нормы!', 'warning');
            }
        } else {
            state.violations = [];
            state.currentStage = 5; // Успех -> Итоги
            toast('Все У.Е. распределены правильно!', 'success');
        }
        render();
    };
}

function showTransferConfirm(ue, targetId) {
    const fromName = PARTICIPANTS.find(p => p.id === ue.owner)?.name || `Уч.${ue.owner}`;
    const toName = PARTICIPANTS.find(p => p.id === targetId)?.name || `Уч.${targetId}`;
    const triadInfo = TRIADS[ue.triad];
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <h3 class="modal-title">Подтверждение передачи</h3>
            <p class="modal-content">
                Передать <b style="color: ${triadInfo.color};">${triadInfo.name} №${ue.number}</b><br>
                от <span class="text-primary font-bold">${fromName}</span> → <span class="text-success font-bold">${toName}</span>?
            </p>
            <div class="modal-actions">
                <button class="btn btn-success" id="confirmTransfer">Да</button>
                <button class="btn btn-danger" id="cancelTransfer">Нет</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    $('#confirmTransfer').onclick = () => { executeTransfer(ue, targetId); modal.remove(); render(); };
    $('#cancelTransfer').onclick = () => { modal.remove(); };
}

// Выполнить передачу (С РАЗДЕЛЕНИЕМ ИНВЕНТАРЕЙ)
function executeTransfer(ue, targetId) {
    // 1. Удаляем из активного инвентаря (units)
    const unitIndex = state.units.findIndex(u => u.id === ue.id);
    if (unitIndex === -1) return;
    state.units.splice(unitIndex, 1);
    
    // 2. Добавляем в массив полученных (receivedUnits)
    if (!state.receivedUnits) state.receivedUnits = [];
    state.receivedUnits.push({
        ...ue,
        owner: targetId,
        from: ue.owner,
        timestamp: Date.now()
    });
    
    // 3. Добавляем в реестр с деталями
    const now = new Date();
    state.transactions.push({
        from: ue.owner,
        to: targetId,
        triad: ue.triad,
        number: ue.number,
        color: ue.color,
        timestamp: now.getTime(),
        timeStr: now.toLocaleTimeString()
    });
    
    toast(`У.Е. №${ue.number} передано!`, 'success');
}

// Проверка нарушений нормы (С УЧЕТОМ receivedUnits)
function checkNormViolations() {
    const violations = [];
    
    const byReceiver = {};
    state.transactions.forEach(t => {
        if (!byReceiver[t.to]) byReceiver[t.to] = [];
        byReceiver[t.to].push(t);
    });
    
    Object.entries(byReceiver).forEach(([receiverId, txs]) => {
        const byFromAndTriad = {};
        
        txs.forEach(t => {
            // Ключ: Отправитель + Триада (включая T5/№21 на общих основаниях)
            const key = `${t.from}_${t.triad}`;
            if (!byFromAndTriad[key]) byFromAndTriad[key] = [];
            byFromAndTriad[key].push(t);
        });
        
        Object.entries(byFromAndTriad).forEach(([key, group]) => {
            if (group.length > 1) {
                const [fromId, triad] = key.split('_');
                const triadInfo = TRIADS[triad];
                
                // Оставляем первую, остальные возвращаем
                group.slice(1).forEach(t => {
                    violations.push({
                        id: t.timestamp,
                        from: t.from,
                        to: t.to,
                        triad: t.triad,
                        number: t.number,
                        msg: `Уч.${fromId} → Уч.${receiverId}: >1 из "${triadInfo.name}" (№${t.number} возврат)`
                    });
                    
                    // ЛОГИКА ВОЗВРАТА:
                    // 1. Найти в receivedUnits
                    const receivedIndex = state.receivedUnits.findIndex(u => 
                        u.triad === t.triad && u.number === t.number && u.owner === receiverId
                    );

                    if (receivedIndex !== -1) {
                        const unit = state.receivedUnits[receivedIndex];
                        // 2. Удалить из receivedUnits
                        state.receivedUnits.splice(receivedIndex, 1);
                        // 3. Вернуть в units (инвентарь отправителя)
                        state.units.push({ 
                            ...unit, 
                            owner: t.from, 
                            to: null,
                            from: undefined // Очищаем поле 'from'
                        });
                    }
                    
                    // Удаляем транзакцию из лога
                    state.transactions = state.transactions.filter(tx => tx.timestamp !== t.timestamp);
                });
            }
        });
    });
    
    return violations;
}

// === ЭКРАН 3.5: ВОЗВРАТ (НОВЫЙ) ===
function renderReturn(container) {
    container.innerHTML = `
        <div class="screen screen-center">
            <div class="modal" style="max-width: 500px; border-color: var(--accent-warning); box-shadow: 0 0 40px rgba(239, 68, 68, 0.2);">
                <div style="color: var(--accent-warning); margin-bottom: 1rem;">${icon('alert', 48)}</div>
                <h1 class="modal-title" style="color: var(--accent-warning);">Журнал возвратов</h1>
                
                <p class="text-muted mb-4">
                    Система обнаружила нарушения нормы.<br>
                    Лишние У.Е. автоматически возвращены отправителям.
                </p>
                
                <div class="mb-6 p-2 rounded" style="background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-color);">
                    <div class="flex justify-between text-sm mb-2">
                        <span>Попытка:</span>
                        <span class="font-bold text-primary">${state.returnAttempts} / 3</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2.5">
                        <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${(state.returnAttempts / 3) * 100}%"></div>
                    </div>
                </div>
                
                <div class="registry mb-6" style="max-height: 200px; text-align: left;">
                    <div class="registry-title">Возвращено отправителям:</div>
                    ${state.violations.map(v => `
                        <div class="registry-item" style="color: ${TRIADS[v.triad].color}; display: flex; align-items: center; gap: 0.5rem;">
                            <span>↩</span> ${v.msg}
                        </div>
                    `).join('')}
                </div>
                
                <button class="btn btn-primary btn-lg w-full" id="btnContinueReturn">
                    Продолжить перераспределение
                </button>
            </div>
        </div>
    `;
    
    $('#btnContinueReturn').onclick = () => {
        state.currentStage = 3; // Обратно к перекидке
        render();
    };
}

// === ЭКРАН 4.0: РЕЗУЛЬТАТЫ (НОВЫЙ) ===
function renderResults(container) {
    let stats = PARTICIPANTS.map(p => {
        const sent = state.transactions.filter(t => t.from === p.id).length;
        // Принял считаем по receivedUnits
        const received = (state.receivedUnits || []).filter(u => u.owner === p.id).length;
        // Сгорело считаем по units (остатки в инвентаре)
        const burned = state.units.filter(u => u.owner === p.id).length;
        // Формула: (Отдал × 2) + (Принял × 1) - (Сгорело × 1)
        const score = (sent * 2) + (received * 1) - (burned * 1);
        const spirituality = Math.min(100, Math.max(0, (score / 30) * 100));
        return { ...p, sent, received, burned, score, spirituality };
    });
    
    // Ранжирование по баллам
    stats.sort((a, b) => b.score - a.score);
    const totalScore = stats.reduce((s, r) => s + r.score, 0);

    container.innerHTML = `
        <div class="screen">
            <div style="color: var(--accent-primary); margin-bottom: 1rem;">${icon('sun', 48)}</div>
            <h1 class="text-3xl text-gradient-success mb-2">Акт 4.0 — Итоги дня</h1>
            <p class="text-muted mb-6">Результаты обмена ценностями</p>
            
            <div class="table-container mb-6">
                <table>
                    <thead>
                        <tr>
                            <th>Место</th>
                            <th>Участник</th>
                            <th class="text-center">Баллы</th>
                            <th class="text-center" style="font-size: 0.75rem">Отдал<br>(x2)</th>
                            <th class="text-center" style="font-size: 0.75rem">Принял<br>(x1)</th>
                            <th class="text-center" style="font-size: 0.75rem">Сгорело<br>(-1)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.map((s, idx) => `
                            <tr ${s.id === '5' ? 'style="background: rgba(168, 85, 247, 0.1);"' : ''}>
                                <td class="font-bold text-muted">#${idx + 1}</td>
                                <td>
                                    <div class="flex flex-col">
                                        <span>${s.name}</span>
                                        <div class="spirituality-bar mt-1" style="height: 4px; max-width: 100px;">
                                            <div class="spirituality-fill" style="width: ${s.spirituality}%; background: ${s.id === '5' ? 'var(--triad-purple)' : 'var(--accent-success)'}"></div>
                                        </div>
                                    </div>
                                </td>
                                <td class="text-center font-bold text-xl text-primary">${s.score}</td>
                                <td class="text-center text-muted">${s.sent}</td>
                                <td class="text-center text-success">${s.received}</td>
                                <td class="text-center text-danger">${s.burned}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="2" class="text-right">Общая духовность:</td><td colspan="4" class="text-center font-bold text-lg">${totalScore}</td></tr>
                    </tfoot>
                </table>
            </div>
            
            <div class="flex gap-4 flex-wrap justify-center">
                <button class="btn btn-secondary" id="btnViewRegistry">Реестр транзакций</button>
                <button class="btn btn-secondary" id="btnContacts">Контакты</button>
                <button class="btn btn-success btn-lg" id="btnNewDay">${icon('sun')} Новый день</button>
                <button class="btn btn-danger" id="btnRestart">Начать заново</button>
            </div>
        </div>
    `;
    
    // Сохранить в историю (упрощено)
    
    $('#btnViewRegistry').onclick = showFullRegistry;
    $('#btnContacts').onclick = () => { state.currentStage = 6; render(); };
    $('#btnNewDay').onclick = () => {
        state.currentKon++;
        state.activeParticipant = 0;
        state.participantSelections = { 1: [], 2: [], 3: [], 4: [] };
        state.selectedScenario = null;
        state.units = [];
        state.receivedUnits = [];
        state.transactions = [];
        state.returnAttempts = 0;
        state.violations = [];
        state.currentStage = 2;
        toast('Новый день начался!', 'success');
        render();
    };
    $('#btnRestart').onclick = () => {
        localStorage.removeItem('pigmalion_state');
        location.reload();
    };
}

// Показать полный реестр (С НОВЫМИ ПОЛЯМИ)
function showFullRegistry() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
            <h3 class="modal-title">Реестр транзакций</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr><th>Время</th><th>От</th><th>Кому</th><th>Триада</th><th>№ У.Е.</th></tr>
                    </thead>
                    <tbody>
                        ${state.transactions.length === 0 
                            ? '<tr><td colspan="5" class="text-center text-muted">Нет транзакций</td></tr>'
                            : state.transactions.map(t => {
                                const triadColor = t.color || TRIADS[t.triad]?.color;
                                return `
                                <tr>
                                    <td class="text-xs text-muted">${t.timeStr || '--:--'}</td>
                                    <td>${t.from === '1' ? `::${state.okKey}::` : `Уч.${t.from}`}</td>
                                    <td>Уч.${t.to}</td>
                                    <td><span style="display: inline-block; width: 10px; height: 10px; background: ${triadColor}; border-radius: 50%; margin-right: 5px;"></span>${TRIADS[t.triad]?.name || t.triad}</td>
                                    <td class="font-bold">${t.number}</td>
                                </tr>
                            `}).join('')
                        }
                    </tbody>
                </table>
            </div>
            <div class="modal-actions mt-4"><button class="btn btn-primary" id="closeRegistry">Закрыть</button></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal || e.target.id === 'closeRegistry') modal.remove(); };
}

// === ЭКРАН 6: КОНТАКТЫ ===
function renderContacts(container) {
    container.innerHTML = `
        <div class="screen screen-center">
            <h1 class="text-3xl text-gradient mb-6">::OP𝕯EH 𝕯AP::</h1>
            <h4 className="text-lg text-blue-300 mb-4">(Олег Головатюк)</h4>
                <p className="text-sm text-gray-300 mb-4">DevOps-архитектор, Автор концепции и визионер стартапа "Пигмалион".</p>
  
            <div class="card mb-6 contacts-section" style="max-width: 400px;">
                <h3 class="text-lg mb-4">Контакты автора</h3>
                <div class="flex items-center gap-4 mb-3">${icon('phone')}<span>+7 999-989-17-19</span></div>
                <div class="flex items-center gap-4">${icon('mail')}<span>ORDENp@gmail.com</span></div>
            </div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://vtb.paymo.ru/collect-money/?transaction=e0bbf146-0286-4bc1-a78e-035f3739c752" alt="QR Payment" class="mb-6" style="border-radius: var(--radius);">
            <div class="manifest"><p>Сбор средств на пилотную НОД.-Платформу «П./К.» (нагрузоустойчивость до 100 мил.пользователей каждый день)</p></div>
                        <a href="https://vtb.paymo.ru/collect-money/?transaction=e0bbf146-0286-4bc1-a78e-035f3739c752" target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline break-all block mb-2">https://vtb.paymo.ru/collect-money/...</a>
                        <p className="text-xs text-gray-500">(сумма от 50 руб. до 999 999 руб.)</p>
        <div class="manifest"><p>«Делай добро и бросай в воду»</p></div>
            <button class="btn btn-primary mt-6" id="btnBackToResults">← Вернуться к итогам</button>
        </div>
    `;
    $('#btnBackToResults').onclick = () => { state.currentStage = 5; render(); };
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    render();
});
