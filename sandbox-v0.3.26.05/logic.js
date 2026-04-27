/**
 * ========================================
 * ПИГМАЛИОН — Песочница v0.3.26.05
 * Логика эмиссии (интегрирован TimeRhythm)
 * ========================================
 */

// === КОНСТАНТЫ ===
const RESET_HOUR = 20;
const SILENCE_START_MINUTES = 19 * 60 + 55;
const SILENCE_END_MINUTES = 20 * 60;
const SLEEP_START_MINUTES = 20 * 60;
const SLEEP_END_MINUTES = 4 * 60;

// === КОНСТАНТА ГОДА (КАНОН v0.3.23) ===
// Допустимые годы для даты выкупа У.М.: 26-99 (2026-2099)
// 00-25 — запрет отправки У.Е. (эпоха до Пигмалиона)
const BUYOUT_YEAR_MIN = 2026;
const BUYOUT_YEAR_MAX = 2099;

const TRIADS = {
    T1: { name: 'Знания', color: '#ef4444', range: [1, 2, 3], ueCount: 3 },
    T2: { name: 'Практики', color: '#facc15', range: [4, 5, 6], ueCount: 3 },
    T3: { name: 'Творчество', color: '#22c55e', range: [7, 8, 9], ueCount: 3 },
    T4: { name: 'Досуг/ЗОЖ', color: '#3b82f6', range: [10, 11, 12], ueCount: 3 },
    T5: { name: '№21', color: '#a855f7', range: [21], ueCount: 1 }
};

// === DOMAIN MAP (связь триад с доменами Облика) ===
const DOMAIN_MAP = {
    T1: ['knowledge'],
    T2: ['care', 'wisdom'],
    T3: ['creativity'],
    T4: ['participation', 'trust'],
    T5: ['core']
};

// Получить триаду по номеру У.Е.
function getTriadByUE(id) {
    return Object.keys(TRIADS).find(key => 
        TRIADS[key].range.includes(id)
    );
}

// Получить вес У.М. для У.Е. (канон: все = 1)
function getUEWeight(ueId) {
    return 1;
}

const MAX_UE_PER_PERIOD = 26;

// 12 тестовых О.К. для выбора получателя
const TEST_OK_LIST = [
    '::01::', '::02::', '::03::', '::04::',
    '::05::', '::06::', '::07::', '::08::',
    '::09::', '::10::', '::11::', '::12::'
];

// Флаг блокировки повторного нажатия кнопки подтверждения
let isConfirming = false;

const AppState = {
    triadsUsed: {},
    lastEmissionTime: null,
    ueUnits: [],
    umBalance: 5,
    transactions: [],
    domains: { knowledge: 0, care: 0, creativity: 0, wisdom: 0, trust: 0, participation: 0 },
    reputationWeight: 0,
    givenTotal: 0,
    receivedTotal: 0,
    burnedTotal: 0,
    todayGiven: 0,
    todayReceived: 0,
    todayBurned: 0,
    lastResetDate: null,
    lastTriadsReset: null,
    lastDailyPlannerReset: null,  // v0.3.26: Дата последней очистки ежедневника
    normUsedToday: { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 },  // Статистика использования триад
    lastNormReset: null  // Дата последнего сброса статистики
};

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function getInternalTime() {
    try {
        const now = new Date();
        if (typeof window.__testTimeOffset === 'number') {
            return new Date(now.getTime() + window.__testTimeOffset);
        }
        return now;
    } catch (e) {
        console.error('[Ошибка] getInternalTime:', e);
        return new Date();
    }
}

// === МОСТЫ К TIMERHYTHM (упрощено, v0.3.23) ===

// === УВЕДОМЛЕНИЯ (showToast) ===
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
  setTimeout(() => toast.remove(), 3000);
}

// === МОСТЫ К TIMERHYTHM (продолжение) ===

function isSilenceZone() {
    return getCurrentPhase() === 'silence';
}

function getCurrentPhase() {
    const now = getInternalTime();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // silence: 19:55 – 20:00 (зона тишины)
    if (totalMinutes >= (19 * 60 + 55) && totalMinutes < (20 * 60)) {
        return 'silence';
    }
    // active: 04:00 – 19:55 (фаза действия)
    if (totalMinutes >= (4 * 60) && totalMinutes < (19 * 60 + 55)) {
        return 'active';
    }
    // sleep: 20:00 – 04:00 (фаза сна)
    return 'sleep';
}

function hasEmittedThisPeriod() {
    if (!AppState.lastEmissionTime) return false;
    return !isNewPeriodSince(AppState.lastEmissionTime);
}

function isTriadAvailable(triadKey) {
    const lastUsed = AppState.triadsUsed[triadKey];
    if (!lastUsed) return true;
    return isNewPeriodSince(lastUsed);
}

function isNewPeriodSince(timestamp) {
    const now = getInternalTime();
    const pastDate = new Date(timestamp);
    if (now.getHours() >= RESET_HOUR && pastDate.getHours() < RESET_HOUR) return true;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(RESET_HOUR, 0, 0, 0);
    if (pastDate < yesterday) return true;
    return false;
}

/**
 * Расчёт времени сгорания У.Е.
 * @param {number} createdAt - timestamp создания У.Е.
 * @returns {number} timestamp сгорания (00:00 следующих суток от даты эмиссии)
 *
 * === ПО КАНОНУ: все У.Е. сгорают в полночь, следующую за датой эмиссии ===
 * Эмиссия в 20:00-03:59 → burnAt = послезавтра 00:00 (28 часов)
 * Эмиссия в 04:00-19:55 → burnAt = завтра 00:00 (4.5-24 часа)
 */
function calculateBurnAt(createdAt) {
    const time = new Date(createdAt || getInternalTime().getTime());
    const hour = time.getHours();
    const burn = new Date(time);

    // Правило 24+4: если заказ после 20:00, прибавляем +2 дня до полуночи
    if (hour >= 20) {
        // Эмиссия 20:00-23:59 → burnAt = послезавтра 00:00 (28 часов жизни)
        burn.setDate(burn.getDate() + 2);
        burn.setHours(0, 0, 0, 0);
    } else if (hour < 4) {
        // Эмиссия 00:00-03:59 → burnAt = завтра 00:00 (до 28 часов)
        burn.setDate(burn.getDate() + 1);
        burn.setHours(0, 0, 0, 0);
    } else {
        // Эмиссия 04:00-19:59 → burnAt = завтра 00:00 (стандартный цикл)
        burn.setDate(burn.getDate() + 1);
        burn.setHours(0, 0, 0, 0);
    }

    return burn.getTime();
}

// === ПРАВИЛО ПЕРЕДАЧИ (канон) ===
// У.Е. важнее фазы, кроме тишины

function isTransferAllowed() {
    const phase = getCurrentPhase();
    const nowMs = getInternalTime().getTime();
    if (phase === 'silence') return false;
    return AppState.ueUnits.some(ue => canTransferUE(ue, phase, nowMs));
}

/**
 * canTransferUE() — единый источник истины (КАНОН v0.3.23)
 * статус + жизнь импульса решают вместе:
 *   active И burnAt > nowMs = можно
 *   impulse = нельзя (до 04:00)
 *   silence = абсолютный запрет
 */
function canTransferUE(ue, phase, nowMs) {
    if (!ue || ue.amount <= 0) return false;
    // Фаза тишины — абсолютный запрет
    if (phase === 'silence') return false;
    // Active или sleep — только active У.Е. с живым burnAt
    if (phase === 'active' || phase === 'sleep') {
        return ue.status === 'active' && ue.burnAt > nowMs;
    }
    return false;
}

/**
 * activateImpulseUE() — переход 04:00: все impulse → active
 * Вызывается в метрономе при смене фазы sleep → active
 */
function activateImpulseUE() {
    let count = 0;
    AppState.ueUnits.forEach(ue => {
        if (ue.status === 'impulse') {
            ue.status = 'active';
            count++;
        }
    });
    if (count > 0) {
        console.log(`[04:00] Активировано ${count} импульсных У.Е. → active`);
        updateUEIndicatorsFromState();
        saveState(); // КРИТИЧНО: сохранение изменений в localStorage
    }
}

function isEmissionAllowed() {
    return getCurrentPhase() !== 'silence';
}

function getUEEmittedThisPeriod() {
    const now = getInternalTime();
    // === ПО КАНОНУ: период = текущие сутки + 1 день (до ближайшей полночи) ===
    const targetBurnAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0).getTime();
    
    return AppState.ueUnits
        .filter(ue => ue.burnAt === targetBurnAt && ue.amount > 0)
        .reduce((sum, ue) => sum + ue.amount, 0);
}

// === ОБНОВЛЕНИЕ UI ===

function updateCurrentDateTime() {
    try {
        const datetimeEl = $('#current-datetime');
        if (!datetimeEl) return;
        const now = getInternalTime();
        datetimeEl.textContent = now.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    } catch (e) {
        console.error('[Ошибка] updateCurrentDateTime:', e);
    }
}

function updateBurnTimerDisplay() {
    const timerEl = $('#burn-timer');
    if (!timerEl) return;

    const now = getInternalTime();
    const nowMs = now.getTime();

    // Берём ВСЕ живые У.Е. (active + impulse) — обе имеют реальный burnAt
    const livingUnits = AppState.ueUnits.filter(ue =>
        ue.amount > 0 &&
        (ue.status === 'active' || ue.status === 'impulse') &&
        ue.burnAt > nowMs
    );

    if (livingUnits.length === 0) {
        timerEl.textContent = '--:--:--';
        return;
    }

    // Ближайший burnAt среди всех живых У.Е.
    const nearestBurnAt = Math.min(...livingUnits.map(ue => ue.burnAt));
    const msUntilBurn = nearestBurnAt - nowMs;

    if (msUntilBurn <= 0) {
        timerEl.textContent = '00:00:00';
        return;
    }

    const hours   = Math.floor(msUntilBurn / 3_600_000);
    const minutes = Math.floor((msUntilBurn % 3_600_000) / 60_000);
    const seconds = Math.floor((msUntilBurn % 60_000) / 1000);
    timerEl.textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

function updateUEBalance() {
    const balanceEl = $('#ue-balance');
    if (balanceEl) {
        balanceEl.textContent = getUEBalance();
        updateUEStatusIndicator();
    }
}

// === ОБНОВЛЕНИЕ ФАЗЫ (Действие/Сон/Тишина) ===
function updatePhaseDisplay(phase, hour, minutes) {
    const phaseIconEl = document.getElementById('phase-icon');
    const phaseNameEl = document.getElementById('phase-name');
    const phaseDescEl = document.getElementById('phase-desc');

    if (phaseIconEl && phaseNameEl && phaseDescEl) {
        if (phase === 'silence') {
            phaseIconEl.textContent = '🔇';
            phaseNameEl.textContent = typeof I18N !== 'undefined' ? I18N.t('phase_silence') : 'Тишина';
            phaseDescEl.textContent = '19:55 – 20:00';
        } else if (phase === 'sleep' || phase === 'impulse') {
            phaseIconEl.textContent = '🌙';
            phaseNameEl.textContent = typeof I18N !== 'undefined' ? I18N.t('phase_sleep') : 'Сон/Предзаказ';
            phaseDescEl.textContent = '20:00 – 04:00';
        } else {
            phaseIconEl.textContent = '🌞';
            phaseNameEl.textContent = typeof I18N !== 'undefined' ? I18N.t('phase_action') : 'Действие';
            phaseDescEl.textContent = '04:00 – 19:55';
        }
    }
}

function updateUEStatusIndicator() {
    const activeUE = AppState.ueUnits.filter(ue => ue.status === 'active' && ue.amount > 0).reduce((sum, ue) => sum + ue.amount, 0);
    const impulseUE = AppState.ueUnits.filter(ue => ue.status === 'impulse' && ue.amount > 0).reduce((sum, ue) => sum + ue.amount, 0);

    const ueActiveEl = document.getElementById('ue-active');
    const ueImpulseEl = document.getElementById('ue-impulse');
    const ueGivenEl = document.getElementById('ue-given');

    if (ueActiveEl) ueActiveEl.textContent = activeUE;
    if (ueImpulseEl) ueImpulseEl.textContent = impulseUE;
    if (ueGivenEl) ueGivenEl.textContent = AppState.todayGiven;
}

function updateUMBalance() {
    const balanceEl = $('#um-balance');
    if (balanceEl) balanceEl.textContent = AppState.umBalance;
}

function updateUEIndicatorsFromState() {
    try {
        const impulseUE = [];
        const activeUE = [];
        AppState.ueUnits.forEach(ue => {
            if (ue.amount > 0 && ue.status !== 'burned' && ue.status !== 'transferred') {
                const ueId = parseInt(ue.id);
                if (ue.status === 'impulse') impulseUE.push(ueId);
                else if (ue.status === 'active') activeUE.push(ueId);
            }
        });
        console.log('[updateUEIndicators] impulse:', impulseUE, 'active:', activeUE);
        updateIndicatorRow('impulse-indicators', impulseUE);
        updateIndicatorRow('active-indicators', activeUE);
    } catch (e) {
        console.error('[Ошибка] updateUEIndicatorsFromState:', e);
    }
}

function updateIndicatorRow(containerId, activeUE) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isImpulseRow = containerId === 'impulse-indicators';

    container.querySelectorAll('.ue-indicator').forEach(indicator => {
        const ueNumber = parseInt(indicator.dataset.ue);
        if (activeUE.includes(ueNumber)) {
            indicator.classList.add('active');
            indicator.classList.toggle('impulse', isImpulseRow);
            indicator.textContent = ueNumber;
        } else {
            indicator.classList.remove('active', 'selected', 'impulse');
            indicator.textContent = '—';
        }
    });

    // Перенавешиваем click-хендлеры для Акт 2 (если это active-indicators)
    if (containerId === 'active-indicators') {
        setupIndicatorClicks();
    }
}

function getUENumbersByTriad(triadKey) {
    const map = { 'T1': [1, 2, 3], 'T2': [4, 5, 6], 'T3': [7, 8, 9], 'T4': [10, 11, 12], 'T5': [21] };
    return map[triadKey] || [];
}

function updateTriadButtons() {
    try {
        const triadButtons = $$('.triad-btn');
        const specialBtn = $('.special-btn');
        const emitBtn = $('.emit-btn');
        const phase = getCurrentPhase();

        if (phase === 'silence') {
            const reason = 'Зона тишины (19:55–20:00)';
            triadButtons.forEach(btn => { btn.disabled = true; btn.classList.add('used'); btn.title = reason; });
            if (specialBtn) { specialBtn.disabled = true; specialBtn.classList.add('used'); specialBtn.title = reason; }
            if (emitBtn) { emitBtn.disabled = true; emitBtn.title = reason; }
            return;
        }

        if (emitBtn) { emitBtn.disabled = false; emitBtn.title = ''; }

        triadButtons.forEach(btn => {
            const triadKey = btn.dataset.triad;
            // === ИСПОЛЬЗУЕМ isTriadAvailable() — учитывает isNewPeriodSince() ===
            // was: used || hasEmitted (блокировал кнопки из-за старых impulse UE)
            if (!isTriadAvailable(triadKey)) {
                btn.classList.add('used');
                btn.disabled = true;
                btn.title = 'Использована в этом периоде, сброс в 20:00';
            } else {
                btn.classList.remove('used');
                btn.disabled = false;
                btn.title = '';
            }
        });

        if (specialBtn) {
            // Проверяем, активирована ли хотя бы одна триада (не T5) в ТЕКУЩЕМ периоде
            const triadsActivated = Object.keys(AppState.triadsUsed).filter(k => k !== 'T5').some(k => isTriadAvailable(k) === false);
            if (!triadsActivated) {
                specialBtn.disabled = true;
                specialBtn.classList.remove('used');
                specialBtn.title = 'Доступно после активации ≥1 триады';
            } else {
                // === ИСПОЛЬЗУЕМ isTriadAvailable() для T5 ===
                if (!isTriadAvailable('T5')) {
                    specialBtn.classList.add('used');
                    specialBtn.disabled = true;
                    specialBtn.title = 'Использована в этом периоде';
                } else {
                    specialBtn.classList.remove('used');
                    specialBtn.disabled = false;
                    specialBtn.title = '';
                }
            }
        }
    } catch (e) {
        console.error('[Ошибка] updateTriadButtons:', e);
    }
}

// === ЭМИССИЯ ===

function initEmission() {
    try {
        const triadButtons = $$('.triad-btn');
        const specialBtn = $('.special-btn');
        const emitBtn = $('.emit-btn');

        if (!emitBtn) {
            console.error('[Ошибка] Кнопка эмиссии не найдена');
            return;
        }

        window.__selectedTriads = [];
        let selectedTriads = window.__selectedTriads;

        triadButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const triadKey = btn.dataset.triad;
                const used = AppState.triadsUsed[triadKey];
                const hasEmitted = AppState.ueUnits.some(ue => ue.triad === triadKey && ue.status === 'impulse' && ue.amount > 0);
                if (used || hasEmitted) {
                    console.log(`[Игнор] Триада ${triadKey} уже использована или заказана`);
                    return;
                }
                if (selectedTriads.includes(triadKey)) {
                    selectedTriads = selectedTriads.filter(t => t !== triadKey);
                    btn.classList.remove('selected');
                } else {
                    selectedTriads.push(triadKey);
                    btn.classList.add('selected');
                }
                let totalUE = 0;
                selectedTriads.forEach(key => { totalUE += TRIADS[key].ueCount; });
                console.log(`[Выбор] ${selectedTriads.length} триад(ы), всего ${totalUE} У.Е.`);
            });
        });

        if (specialBtn) {
            specialBtn.addEventListener('click', () => {
                if (!specialBtn.disabled) {
                    const hasEmittedSpecial = AppState.ueUnits.some(ue => ue.triad === 'T5' && ue.status === 'impulse' && ue.amount > 0);
                    const specialUsed = AppState.triadsUsed['T5'];
                    if (specialUsed || hasEmittedSpecial) {
                        console.log('[Игнор] №21 уже использована или заказана');
                        return;
                    }
                    if (selectedTriads.includes('T5')) {
                        selectedTriads = selectedTriads.filter(t => t !== 'T5');
                        specialBtn.classList.remove('selected');
                    } else {
                        selectedTriads.push('T5');
                        specialBtn.classList.add('selected');
                    }
                }
            });
        }

        // === ГЛАВНЫЙ ОБРАБОТЧИК КНОПКИ "ЭМИТИРОВАТЬ" ===
        emitBtn.addEventListener('click', () => {
            console.log('[Эмитировать] Клик на кнопку');
            
            if (selectedTriads.length === 0) {
                alert(I18N.t('notification_select_triad') || 'Выберите одну из триад (или все), а затем «дополнительную» У.Е. №21');
                return;
            }

            if (selectedTriads.includes('T5')) {
                const hasEmittedAnyTriad = ['T1', 'T2', 'T3', 'T4'].some(t => {
                    const used = AppState.triadsUsed[t];
                    const hasEmitted = AppState.ueUnits.some(ue => ue.triad === t && ue.status === 'impulse' && ue.amount > 0);
                    return used || hasEmitted;
                });
                if (!selectedTriads.some(t => t !== 'T5') && !hasEmittedAnyTriad) {
                    alert('⚠️ У.Е. №21 доступна только ПОСЛЕ активации хотя бы одной триады (1-4).');
                    return;
                }
            }

            const filteredTriads = selectedTriads.filter(key => {
                const used = AppState.triadsUsed[key];
                const hasEmitted = AppState.ueUnits.some(ue => ue.triad === key && ue.status === 'impulse' && ue.amount > 0);
                return !used && !hasEmitted;
            });

            if (filteredTriads.length === 0) {
                alert('Все выбранные триады уже использованы или заказаны!');
                return;
            }

            let totalUE = 0;
            filteredTriads.forEach(key => { totalUE += TRIADS[key].ueCount; });

            emitUE(filteredTriads, totalUE);

            window.__selectedTriads = [];
            selectedTriads = window.__selectedTriads;
            console.log('[Эмитировать] Выбор сброшен после эмиссии');
        });

        if (specialBtn && Object.keys(AppState.triadsUsed).filter(k => k !== 'T5').length > 0) {
            specialBtn.disabled = false;
        }
    } catch (e) {
        console.error('[Ошибка] initEmission:', e);
    }
}

function emitUE(selectedTriads, totalUE) {
    // === ЗАЩИТА: без О.К. нельзя эмитировать ===
    if (!guardRequireOK()) return;

    const phase = getCurrentPhase();

    if (!isEmissionAllowed()) {
        alert('⚠️ Зона тишины (19:55–20:00).\n\nЭмиссия временно недоступна. Подождите 20:00.');
        return;
    }

    console.log(`[Эмиссия] Заказано: ${totalUE} У.Е. (${selectedTriads.join(', ')})`);

    const newTriads = selectedTriads.filter(key => !AppState.triadsUsed[key]);
    if (newTriads.length === 0) {
        alert('Все выбранные триады уже использованы!');
        return;
    }

    let actualTotalUE = 0;
    newTriads.forEach(key => { actualTotalUE += TRIADS[key].ueCount; });

    const emittedThisPeriod = getUEEmittedThisPeriod();
    const nowDebug = getInternalTime();
    console.log(`[Эмиссия] Проверка лимита: сейчас=${nowDebug.getHours()}:${nowDebug.getMinutes()}, burnAt=${new Date(calculateBurnAt()).toLocaleTimeString()}, уже заказано=${emittedThisPeriod}, хотим=${actualTotalUE}, лимит=${MAX_UE_PER_PERIOD}`);
    
    if (emittedThisPeriod + actualTotalUE > MAX_UE_PER_PERIOD) {
        alert(`⚠️ Превышен лимит У.Е. на период.\n\nЗаказано: ${emittedThisPeriod} У.Е.\nДоступно: ${MAX_UE_PER_PERIOD - emittedThisPeriod} У.Е.\nВы выбрали: ${actualTotalUE} У.Е.`);
        return;
    }

    const now = getInternalTime().getTime();  // ИСПРАВЛЕНО: тестовое время вместо реального
    const burnAt = calculateBurnAt(now);  // Передаём createdAt для расчёта burnAt
    const status = phase === 'sleep' ? 'impulse' : 'active';

    const txId = generateTxId();
    const createdUEs = [];

    newTriads.forEach(triadKey => {
        const ueNumbers = getUENumbersByTriad(triadKey);
        ueNumbers.forEach(ueId => {
            const ue = {
                id: ueId,
                triad: triadKey,
                amount: 1,
                burnAt: burnAt,
                status: status,
                createdAt: now
            };
            AppState.ueUnits.push(ue);
            createdUEs.push(ue);
            console.log(`[Эмиссия] У.Е. №${ueId} (${triadKey}) добавлена`);
        });
        AppState.triadsUsed[triadKey] = now;
    });

    // === УСТАНОВКА lastEmissionTime (КАНОН v0.3.24) ===
    AppState.lastEmissionTime = now;

    // Запись следа через Storage
    Storage.recordEmission({
        triads: newTriads,
        totalAmount: actualTotalUE,
        createdUEs: createdUEs,
        txId: txId
    });

    updateUEBalance();
    updateTriadButtons();
    updateUEStatusIndicator();
    updateUEIndicatorsFromState();
    $$('.triad-btn, .special-btn').forEach(btn => btn.classList.remove('selected'));
    saveState();
    triggerOKBadgeGlow();

    console.log(`[После эмиссии] Баланс: ${getUEBalance()} У.Е.`);
}

function getUEBalance() {
    const activeUE = AppState.ueUnits.filter(ue => ue.status === 'active' && ue.amount > 0).reduce((sum, ue) => sum + ue.amount, 0);
    const impulseUE = AppState.ueUnits.filter(ue => ue.status === 'impulse' && ue.amount > 0).reduce((sum, ue) => sum + ue.amount, 0);
    const total = activeUE + impulseUE;
    window.__ueBalanceLast = { active: activeUE, impulse: impulseUE, total: total };
    return total;
}

// === ПЕРЕДАЧА ===

let selectedUEForTransfer = [];
let selectedRefs = []; // Выбранные ссылки на предыдущие акты (макс. 3)
let currentModal = null;  // Только одно активное модальное окно

function initTransfer() {
    try {
        const recipientLabel = document.getElementById('recipient-label');
        const uzModal = document.getElementById('uz-registry-modal');
        const uzContent = document.getElementById('uz-registry-content');
        if (recipientLabel && uzModal && uzContent) {
            recipientLabel.addEventListener('click', () => {
                renderUzRegistry(uzContent);
                uzModal.style.display = 'flex';
            });
        }

        setupIndicatorClicks();

        const transferBtn = $('.transfer-btn');
        if (transferBtn) {
            transferBtn.addEventListener('click', transferSelectedUE);
        }
    } catch (e) {
        console.error('[Ошибка] initTransfer:', e);
    }
}

/**
 * Навешивание click-хендлеров на индикаторы У.Е. (Акт 2)
 * Вызывается при init() и после каждой перерисовки индикаторов
 */
function setupIndicatorClicks() {
    $$('#active-indicators .ue-indicator').forEach(indicator => {
        // Удаляем старый обработчик, если есть
        const oldHandler = indicator._clickHandler;
        if (oldHandler) {
            indicator.removeEventListener('click', oldHandler);
        }

        // Создаём новый обработчик
        const newHandler = () => {
            const ueNumber = parseInt(indicator.dataset.ue);
            if (!indicator.classList.contains('active')) return;
            // Приведение типов: id может быть string или number
            const ue = AppState.ueUnits.find(u => parseInt(u.id) === ueNumber && u.status === 'active' && u.amount > 0);
            if (!ue) return;

            // UI-защита: проверка через canTransferUE
            const phase = getCurrentPhase();
            const nowMs = getInternalTime().getTime();
            if (!canTransferUE(ue, phase, nowMs)) {
                indicator.classList.add('disabled');
                return;
            }

            if (selectedUEForTransfer.includes(ueNumber)) {
                selectedUEForTransfer = selectedUEForTransfer.filter(id => id !== ueNumber);
                indicator.classList.remove('selected');
            } else {
                selectedUEForTransfer.push(ueNumber);
                indicator.classList.add('selected');
            }
            updateTransferButton();
        };

        // Сохраняем ссылку на обработчик и добавляем его
        indicator._clickHandler = newHandler;
        indicator.addEventListener('click', newHandler);
    });
}

/**
 * Рендер последних 3 транзакций в блок ro.DAG Refs
 * Вызывается при init(), после передачи, и при обновлении реестра
 */
function renderRefs() {
    const container = document.getElementById('refs-display');
    const hint = document.querySelector('.refs-empty-hint');
    if (!container) return;

    const txs = AppState.transactions;

    if (txs.length === 0) {
        container.innerHTML = '';
        if (hint) hint.style.display = 'block';
        return;
    }

    if (hint) hint.style.display = 'none';

    // Берём последние 3 транзакции, переворачиваем (новые сверху)
    const last3 = txs.slice(-3).reverse();

    container.innerHTML = last3.map((tx, idx) => {
        const trackNum = txs.length - idx; // Номер трека
        const time = new Date(tx.timestamp);
        const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        // Короткое описание: ::О.К.:: → У.Е. №N
        const fromShort = normalizeOK(tx.from).replace(/::/g, '');
        const ueNum = tx.ueNumber ? `№${tx.ueNumber}` : (tx.ueIds ? `№${tx.ueIds.join(',')}` : '№—');
        const isSelected = selectedRefs.includes(trackNum);

        return `<div class="ref-item${isSelected ? ' selected' : ''}" data-ref-track="${trackNum}" title="Трек #${trackNum} · ${hhmm} · ${fromShort} → ${ueNum}">
          <span class="ref-track">#${trackNum}</span>
          <span class="ref-body">${hhmm} ::${fromShort}:: → ${ueNum}</span>
        </div>`;
    }).join('');

    setupRefClicks();
}

/**
 * Навешивание click-хендлеров на refs (toggle выделения)
 */
function setupRefClicks() {
    document.querySelectorAll('.ref-item').forEach(item => {
        // Удаляем старые хендлеры клонированием
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
    });

    document.querySelectorAll('.ref-item').forEach(item => {
        item.addEventListener('click', () => {
            const trackNum = parseInt(item.dataset.refTrack);

            if (selectedRefs.includes(trackNum)) {
                selectedRefs = selectedRefs.filter(r => r !== trackNum);
                item.classList.remove('selected');
            } else {
                if (selectedRefs.length >= 3) {
                    // Удаляем самый старый (первый в массиве)
                    const removed = selectedRefs.shift();
                    const oldItem = document.querySelector(`.ref-item[data-ref-track="${removed}"]`);
                    if (oldItem) oldItem.classList.remove('selected');
                }
                selectedRefs.push(trackNum);
                item.classList.add('selected');
            }
        });
    });
}

function updateTransferButton() {
    const transferBtn = $('.transfer-btn');
    if (transferBtn) {
        if (selectedUEForTransfer.length > 0) {
            transferBtn.disabled = false;
            transferBtn.textContent = `Передать ${selectedUEForTransfer.length} У.Е.`;
        } else {
            transferBtn.disabled = true;
            transferBtn.textContent = 'Передать';
        }
    }
}

// === ПЕРЕМЕННЫЕ ДЛЯ МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ ===
let pendingTransferData = null;

function transferSelectedUE() {
    const phase = getCurrentPhase();
    const nowMs = getInternalTime().getTime();

    // Проверка фазы и статуса каждой выбранной У.Е. через единый фильтр
    const blockedUE = selectedUEForTransfer.filter(id => {
        const ue = AppState.ueUnits.find(u => parseInt(u.id) === id);
        return !canTransferUE(ue, phase, nowMs);
    });

    if (blockedUE.length > 0) {
        if (phase === 'silence') {
            alert('⚠️ Зона тишины (19:55–20:00).\n\nПередача временно недоступна.');
        } else {
            alert('⚠️ Передача невозможна.\n\nВыбранные У.Е. недоступны (статус "импульс" или уже сгорели).');
        }
        return;
    }

    if (selectedUEForTransfer.length === 0) {
        alert('⚠️ Выберите У.Е. для передачи.');
        return;
    }

    const recipient = $('#recipient').value.trim();
    if (!recipient) {
        alert('Введите получателя');
        return;
    }

    // === ЗАПРЕТ САМОБЛАГОДАРНОСТИ (этика) ===
    if (isSelfGratitude(recipient)) {
        showToast('Невозможно поблагодарить самого себя. Согласно канону, акт признания требует наличия Получателя.', 'error');
        console.error('[Этика] Попытка самоблагодарности:', recipient);
        return;
    }

    // === ДОП. ПРОВЕРКА: У.Е. ещё доступна (active + amount > 0) ===
    const unavailableUE = [];
    selectedUEForTransfer.forEach(id => {
        if (!AppState.ueUnits.find(u => u.id === id && u.status === 'active' && u.amount > 0)) {
            unavailableUE.push(id);
        }
    });

    if (unavailableUE.length > 0) {
        alert(`⚠️ У.Е. ${unavailableUE.join(', ')} больше недоступны.`);
        selectedUEForTransfer = selectedUEForTransfer.filter(id => !unavailableUE.includes(id));
        updateUEIndicatorsFromState();
        updateTransferButton();
        return;
    }

    const message = $('#gratitude-message')?.value.trim() ?? '';

    // === ПРАВИЛО НОРМЫ (фильтр с учётом истории) ===
    const alreadySentTriads = getAlreadySentTo(recipient);
    const filteredUEIds = filterByNormRule(selectedUEForTransfer, alreadySentTriads);
    const returnedCount = selectedUEForTransfer.length - filteredUEIds.length;

    // Возврат «избыточных» У.Е. в active
    selectedUEForTransfer.forEach(id => {
        if (!filteredUEIds.includes(id)) {
            const ue = AppState.ueUnits.find(u => u.id === id);
            if (ue) {
                ue.status = 'active';
                ue.amount = 1;
                console.log(`[Правило Нормы] У.Е. №${id} возвращена в актив`);
            }
        }
    });

    // === ОБНОВЛЕНИЕ selectedUEForTransfer (v0.3.21) ===
    // После фильтрации обновляем массив и снимаем выделение с индикаторов
    selectedUEForTransfer = [...filteredUEIds];
    updateUEIndicatorsFromState();  // Снимает .selected с возвращённых У.Е.
    updateTransferButton();

    // === ОТКРЫТИЕ МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ (v0.3.19) ===
    const isMember = recipient.includes('::');
    
    // Сохраняем данные для последующей передачи
    pendingTransferData = {
        recipient: recipient,
        ueIds: [...filteredUEIds],
        message: message,
        isMember: isMember,
        returnedCount: returnedCount,
        alreadySentTriads: alreadySentTriads
    };

    // Заполняем модальное окно
    openTransferConfirmModal(pendingTransferData);
}

/**
 * Открытие модального окна подтверждения передачи
 * @param {Object} data - Данные передачи
 */
function openTransferConfirmModal(data) {
    const modal = document.getElementById('transfer-confirm-modal');
    const guestFields = document.getElementById('guest-fields');
    const optionalFieldsBlock = document.querySelector('.transfer-fields--optional');

    // Заполняем информацию
    $('#confirm-recipient').textContent = data.isMember ? `::${data.recipient.replace(/::/g, '')}::` : `@${data.recipient}`;
    $('#confirm-ue-count').textContent = data.ueIds.length;

    // Показываем поля для гостей если нужно
    if (!data.isMember) {
        guestFields.style.display = 'block';
        // Активируем первую вкладку (RIP) по умолчанию
        switchVKTab('rip');
    } else {
        guestFields.style.display = 'none';
        // Для участников показываем опциональные поля
        if (optionalFieldsBlock) optionalFieldsBlock.style.display = 'block';
    }

    // Очищаем опциональные поля
    $('#gratitude-reason').value = '';
    $('#custom-message-group').style.display = 'none';
    $('#custom-message').value = '';
    $('#delivery-term').value = '';
    $('#buyout-date').value = '';
    $('#ok3').value = '';

    // Показываем модальное окно
    modal.style.display = 'flex';
}

/**
 * Закрытие модального окна подтверждения
 */
function closeTransferConfirmModal() {
    const modal = document.getElementById('transfer-confirm-modal');
    modal.style.display = 'none';
    pendingTransferData = null;

    // Сбрасываем флаг блокировки и восстанавливаем обе кнопки
    isConfirming = false;
    const confirmBtn = document.getElementById('confirm-transfer-btn');
    const headerConfirmBtn = document.getElementById('header-confirm-transfer-btn');
    
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✓ Подтвердить передачу';
    }
    if (headerConfirmBtn) {
        headerConfirmBtn.disabled = false;
        headerConfirmBtn.textContent = '✦ Подтвердить';
    }
}

/**
 * Обработка выбора причины благодарности (показ поля для ручного ввода)
 */
function initGratitudeReasonHandler() {
    const reasonSelect = document.getElementById('gratitude-reason');
    const customGroup = document.getElementById('custom-message-group');
    
    if (reasonSelect && customGroup) {
        reasonSelect.addEventListener('change', () => {
            if (reasonSelect.value === 'custom') {
                customGroup.style.display = 'block';
                $('#custom-message').focus();
            } else {
                customGroup.style.display = 'none';
            }
        });
    }
}

/**
 * Подтверждение и выполнение передачи
 */
function confirmTransfer() {
    // Защита от повторного нажатия
    if (isConfirming) {
        console.log('[Передача] Уже выполняется подтверждение, игнорируем повторное нажатие');
        return;
    }

    if (!pendingTransferData) return;

    // Блокируем повторные нажатия
    isConfirming = true;
    const confirmBtn = document.getElementById('confirm-transfer-btn');
    const headerConfirmBtn = document.getElementById('header-confirm-transfer-btn');
    
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Обработка...';
    }
    if (headerConfirmBtn) {
        headerConfirmBtn.disabled = true;
        headerConfirmBtn.textContent = 'Обработка...';
    }

    const data = pendingTransferData;
    const isMember = data.isMember;

    // Проверка temporaryKey для гостей (с учётом вкладок)
    let temporaryKey = '';
    let isRIP = false;
    let ripYears = '';
    let ripGratitude = '';

    if (!isMember) {
        if (currentVKTab === 'rip') {
            // Для RIP: годы жизни обязательны
            ripYears = $('#rip-years')?.value.trim() || '';
            ripGratitude = $('#rip-gratitude')?.value.trim() || '';

            if (!ripYears || !ripGratitude) {
                alert('⚠️ Для R.I.P. передачи необходимо указать:\n- Годы жизни (например: .1828.-.1910.)\n- Благодарность за что');
                isConfirming = false;
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '✓ Подтвердить передачу';
                }
                if (headerConfirmBtn) {
                    headerConfirmBtn.disabled = false;
                    headerConfirmBtn.textContent = '✦ Подтвердить';
                }
                return;
            }
            temporaryKey = 'R.I.P.';
            isRIP = true;
        } else if (currentVKTab === 'phone') {
            temporaryKey = $('#vk-phone')?.value.trim() || '';
        } else if (currentVKTab === 'email') {
            temporaryKey = $('#vk-email')?.value.trim() || '';
        } else if (currentVKTab === 'phone-email') {
            const phone = $('#vk-phone-combo')?.value.trim() || '';
            const email = $('#vk-email-combo')?.value.trim() || '';
            if (!phone && !email) {
                alert('⚠️ Укажите хотя бы один контакт:\n- Телефон\n- Email');
                isConfirming = false;
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '✓ Подтвердить передачу';
                }
                if (headerConfirmBtn) {
                    headerConfirmBtn.disabled = false;
                    headerConfirmBtn.textContent = '✦ Подтвердить';
                }
                return;
            }
            temporaryKey = phone && email ? `${phone} / ${email}` : (phone || email);
        }

        if (!temporaryKey) {
            alert('⚠️ Для отправки гостю необходим временный ключ (в.К.)\n\nУкажите телефон или e-mail');
            isConfirming = false;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '✓ Подтвердить передачу';
            }
            if (headerConfirmBtn) {
                headerConfirmBtn.disabled = false;
                headerConfirmBtn.textContent = '✦ Подтвердить';
            }
            return;
        }
    }

    // Получаем сообщение благодарности (из select или custom, или из RIP)
    const gratitudeReason = $('#gratitude-reason').value;
    let message = '';

    if (isRIP) {
        // Для RIP используем обязательное поле благодарности
        message = ripGratitude;
    } else if (gratitudeReason === 'custom') {
        message = $('#custom-message').value.trim();
    } else if (gratitudeReason) {
        message = gratitudeReason;
    } else {
        message = data.message || '';  // Старое сообщение из основного поля (если есть)
    }

    // Получаем опциональные поля
    const deliveryTerm = $('#delivery-term').value || '';
    const valuation = null;
    let buyoutDate = $('#buyout-date').value || '';
    const ok3 = $('#ok3').value.trim() || '';

    // === ПРОВЕРКА ГОДА ДАТЫ ВЫКУПА (КАНОН v0.3.24) ===
    if (buyoutDate) {
        // Валидация формата дд.мм.гг
        const match = buyoutDate.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
        if (!match) {
            alert('⚠️ Неверный формат даты.\n\nОжидается: дд.мм.гг (например: 31.06.26)');
            isConfirming = false;
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✓ Подтвердить передачу'; }
            if (headerConfirmBtn) { headerConfirmBtn.disabled = false; headerConfirmBtn.textContent = '✦ Подтвердить'; }
            return;
        }
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);

        if (day < 1 || day > 31) {
            alert(`⚠️ День вне диапазона (01–31).\nУказано: ${String(day).padStart(2, '0')}`);
            isConfirming = false;
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✓ Подтвердить передачу'; }
            if (headerConfirmBtn) { headerConfirmBtn.disabled = false; headerConfirmBtn.textContent = '✦ Подтвердить'; }
            return;
        }
        if (month < 1 || month > 12) {
            alert(`⚠️ Месяц вне диапазона (01–12).\nУказано: ${String(month).padStart(2, '0')}`);
            isConfirming = false;
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✓ Подтвердить передачу'; }
            if (headerConfirmBtn) { headerConfirmBtn.disabled = false; headerConfirmBtn.textContent = '✦ Подтвердить'; }
            return;
        }
        if (year < 26 || year > 99) {
            alert(`⚠️ Год вне допустимого диапазона.\n\nДопустимо: 26–99 (2026–2099)\nУказано: ${year}`);
            isConfirming = false;
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✓ Подтвердить передачу'; }
            if (headerConfirmBtn) { headerConfirmBtn.disabled = false; headerConfirmBtn.textContent = '✦ Подтвердить'; }
            return;
        }
        // Дата валидна — оставляем как есть (дд.мм.гг)
    }

    // Создаём транзакцию
    const transaction = {
        id: generateTxId(),
        type: 'transfer',
        from: 'current_user',
        to: normalizeOK(data.recipient),
        amount: data.ueIds.length,
        ueIds: [...data.ueIds],
        message: message,
        timestamp: getInternalTime().getTime(),
        // Ссылки на предыдущие акты (ro.DAG) — макс. 3
        refs: [...selectedRefs],
        // Новые поля (v0.3.19)
        temporaryKey: temporaryKey || null,               // ПОЛНЫЙ — хранение
        temporaryKeyMasked: maskTemporaryKey(temporaryKey), // для публичного реестра
        deliveryTerm: deliveryTerm || null,
        valuation: valuation || null,
        buyoutDate: buyoutDate || null,
        ok3: ok3 || null
    };

    AppState.transactions.push(transaction);

    // Обновляем У.Е.
    const triadStats = {};
    data.ueIds.forEach(id => {
        const ue = AppState.ueUnits.find(u => u.id === id);
        if (ue) {
            ue.amount = 0;
            ue.status = 'transferred';

            if (!triadStats[ue.triad]) triadStats[ue.triad] = [];
            triadStats[ue.triad].push(ue.id);
            AppState.normUsedToday[ue.triad]++;
        }
    });

    AppState.todayGiven += data.ueIds.length;
    AppState.givenTotal += data.ueIds.length;

    // Лог статистики
    const triadLog = Object.entries(triadStats)
        .map(([triad, ids]) => `${triad}: №${ids.join(', №')}`)
        .join(', ');
    console.log(`[Статистика] Использовано триад: ${triadLog}`);

    // Запись следа через Storage
    Storage.recordTransfer({
        to: data.recipient,
        amount: data.ueIds.length,
        ueIds: [...data.ueIds],
        message: message,
        txId: transaction.id
    });

    // === v0.3.26: Обновление даты активности ===
    updateActivityDate();

    // Обновление UI
    updateDomainsFromDAR();
    calculateWeight();
    calculateSpiritualDynamics();
    updateUEBalance();
    updateUEIndicatorsFromState();
    updateUEStatusIndicator();

    $('#recipient').value = '';
    selectedUEForTransfer = [];
    selectedRefs = []; // Сброс выбранных refs
    updateUEIndicatorsFromState();  // v0.3.21: снимаем выделение с оставшихся У.Е.
    updateTransferButton();
    renderRefs(); // Обновляем блок refs
    triggerOKBadgeGlow();

    // Уведомление
    if (data.returnedCount > 0) {
        const sentList = data.ueIds.map(id => `№${id}`).join(', ');
        showToast(`Передано: ${data.ueIds.length} У.Е. (${sentList}). Возвращено в актив: ${data.returnedCount} У.Е.`, 'success');
    } else {
        showToast(`Передано: ${data.ueIds.length} У.Е.`, 'success');
    }

    console.log(`[Передача] ${data.ueIds.length} У.Е. → ${data.recipient}`);

    // Сохраняем состояние ПЕРЕД закрытием модального окна
    saveState();

    // Закрываем модальное окно ПОСЛЕ сохранения
    closeTransferConfirmModal();
    
    // Показываем финальный toast
    showToast('✦ Отправлено!', 'success');
}

// === ВЕС ===

function calculateWeight() {
    const today = getInternalTime().toDateString();
    if (AppState.lastResetDate !== today) {
        AppState.todayGiven = 0;
        AppState.todayReceived = 0;
        AppState.todayBurned = 0;
        AppState.lastResetDate = today;
        console.log(`[ВЕС] Сброс показателей на ${today}`);
    }

    // Производные числа (сразу ×2, ×1, −1)
    const todayGivenX2 = AppState.todayGiven * 2;
    const totalGivenX2 = AppState.givenTotal * 2;
    const todayReceivedX1 = AppState.todayReceived;
    const totalReceivedX1 = AppState.receivedTotal;
    const todayBurnedX1 = AppState.todayBurned;
    const totalBurnedX1 = AppState.burnedTotal;

    // ВЕС
    const todayWeight = todayGivenX2 + todayReceivedX1 - todayBurnedX1;
    const totalWeight = totalGivenX2 + totalReceivedX1 - totalBurnedX1;
    const daysActive = 1;
    const avgWeight = totalWeight / daysActive;

    AppState.reputationWeight = totalWeight;

    // === ОБНОВЛЕНИЕ НОВОЙ ТАБЛИЦЫ (4 строки) ===
    if ($('#today-given-x2')) $('#today-given-x2').textContent = todayGivenX2;
    if ($('#total-given-x2')) $('#total-given-x2').textContent = totalGivenX2;
    if ($('#today-received-x1')) $('#today-received-x1').textContent = todayReceivedX1;
    if ($('#total-received-x1')) $('#total-received-x1').textContent = totalReceivedX1;
    if ($('#today-burned-x1')) $('#today-burned-x1').textContent = todayBurnedX1;
    if ($('#total-burned-x1')) $('#total-burned-x1').textContent = totalBurnedX1;
    if ($('#today-weight')) $('#today-weight').textContent = todayWeight;
    if ($('#total-weight')) $('#total-weight').textContent = totalWeight;
    if ($('#avg-weight')) $('#avg-weight').textContent = avgWeight.toFixed(1);

    // === ЦВЕТОВАЯ ПОДСВЕТКА ВЕСА ===
    const weightEl = $('#today-weight');
    if (weightEl) {
        if (todayWeight > 0) {
            weightEl.style.color = 'var(--accent-green)';
        } else if (todayWeight < 0) {
            weightEl.style.color = 'var(--accent-red)';
        } else {
            weightEl.style.color = 'var(--text-primary)';
        }
    }
}

// === ШКАЛА ДУХОВНОСТИ (Зеркало присутствия) ===
// Формула: (Отдано × 2%) + (Принято × 1%) − (Сгорело × 1%)
// Обнуление в 04:00 (синхронно с активацией У.Е.)

function calculateSpiritualDynamics() {
    const now = getInternalTime();
    const hour = now.getHours();

    let spiritualPercent = 0;

    // === ВРЕМЕННОЙ КОНТУР ===
    // 00:00–04:00 — показываем итоги вчерашнего дня (включая сгоревшие У.Е.)
    // 04:00–00:00 — показываем текущий день

    if (hour >= 0 && hour < 4) {
        // Ночь: учитываем сгоревшие У.Е. для отображения отрицательного следа
        const burnedCount = AppState.ueUnits
            .filter(ue => ue.status === 'burned')
            .reduce((sum, ue) => sum + ue.amount, 0);

        spiritualPercent = (AppState.todayGiven * 2) + 
                          (AppState.todayReceived * 1) - 
                          burnedCount;
    } else {
        // День: обычный расчёт
        spiritualPercent = (AppState.todayGiven * 2) + 
                          (AppState.todayReceived * 1) - 
                          AppState.todayBurned;
    }

    // Ограничение минуса (максимум -13% при потере всех базовых У.Е.)
    if (spiritualPercent < -13) spiritualPercent = -13;

    // === ОБНОВЛЕНИЕ UI ===
    const fillEl = $('#spiritual-fill');
    const valueEl = $('#spiritual-value');

    if (fillEl && valueEl) {
        // Убираем все классы
        fillEl.classList.remove('negative', 'positive', 'neutral');
        valueEl.classList.remove('negative', 'positive', 'neutral');

        // Определяем зону и устанавливаем ширину
        let absPercent = Math.abs(spiritualPercent);

        if (spiritualPercent > 0) {
            // Зелёная зона (Positive): +1% до +33%
            fillEl.classList.add('positive');
            valueEl.classList.add('positive');
            fillEl.style.width = Math.min(absPercent, 50) + '%';
        } else if (spiritualPercent < 0) {
            // Красная зона (Negative): -13% до -1%
            fillEl.classList.add('negative');
            valueEl.classList.add('negative');
            fillEl.style.width = Math.min(absPercent * 3, 50) + '%';
        } else {
            // Точка покоя (Zero): 0%
            fillEl.classList.add('neutral');
            valueEl.classList.add('neutral');
            fillEl.style.width = '0%';
        }

        valueEl.textContent = (spiritualPercent > 0 ? '+' : '') + spiritualPercent + '%';
    }

    // Лог для отладки
    if (window.__lastSpiritualPercent !== spiritualPercent) {
        console.log(`[Шкала] ${spiritualPercent > 0 ? '+' : ''}${spiritualPercent}%`);
        window.__lastSpiritualPercent = spiritualPercent;
    }
}

// === СГОРАНИЕ (устаревшие функции - оставлены для совместимости) ===

function checkBurn() {
    console.warn('[checkBurn] DEPRECATED — используется TimeRhythm в метрономе');
}

function updateUEStatuses() {
    console.warn('[updateUEStatuses] DEPRECATED — используется TimeRhythm в метрономе');
}

function resetTriadsForNewPeriod() {
    const now = getInternalTime();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes >= 20 * 60 && minutes < 20 * 60 + 5) {
        AppState.triadsUsed = {};
        console.log('[20:00] Triads reset');
    }
}

// === УТИЛИТЫ ===

/**
 * Маскировка временного ключа (в.К.) для публичного реестра
 * @param {string} key - полный в.К. (телефон и/или email)
 * @returns {string} маскированная версия или '(в.К.)'
 */
function maskTemporaryKey(key) {
  if (!key) return '(в.К.)';
  const parts = key.split(/\s+/);
  return parts.map(part => {
    if (part.length <= 4) return '***';
    const first = part.slice(0, 2);
    const last = part.slice(-1);
    const mid = '*'.repeat(Math.min(part.length - 3, 6));
    return first + mid + last;
  }).join(' ');
}

function generateTxId() {
    return 'tx_' + Math.random().toString(36).substring(2, 10) + getInternalTime().getTime().toString(36);
}

// === О.К. БЕЙДЖ ===

function getCorrectLength(str) {
    return [...str].length;
}

function updateOKBadge() {
    try {
        const okKey = localStorage.getItem('pygmalion_ok_key');
        const okCreated = localStorage.getItem('pygmalion_ok_created');

        console.log('[updateOKBadge] okKey:', okKey);
        console.log('[updateOKBadge] okCreated:', okCreated);

        const badgeContainer = document.getElementById('ok-badge-container');
        const badge = document.getElementById('ok-badge');
        const okValue = document.getElementById('ok-value');
        const okDate = document.getElementById('ok-date');
        const noOkWarning = document.getElementById('no-ok-warning');

        console.log('[updateOKBadge] Elements found:', {
            badgeContainer: !!badgeContainer,
            okValue: !!okValue,
            okDate: !!okDate,
            noOkWarning: !!noOkWarning
        });

        if (okKey && getCorrectLength(okKey) >= 3) {
            console.log('[updateOKBadge] О.К. валиден, показываем badge');
            if (badgeContainer) badgeContainer.style.display = 'flex';
            if (okValue) {
                const okClean = okKey.replace(/::/g, '');
                okValue.innerHTML = `::${colorizeOK(okClean)}::`;
            }
            if (okCreated) {
                const date = new Date(okCreated);
                if (okDate) {
                    if (!isNaN(date.getTime())) {
                        const locale = AppState.currentLang === 'en' ? 'en-US' : 'ru-RU';
                        const options = AppState.currentLang === 'en'
                            ? { month: 'short', day: 'numeric', year: 'numeric' }
                            : { month: 'short', year: 'numeric' };
                        okDate.textContent = date.toLocaleDateString(locale, options);
                    } else {
                        okDate.textContent = '—';
                    }
                }
            }
            document.title = `Pygmalion — ${okKey.replace(/::/g, '')}`;
            if (noOkWarning) noOkWarning.style.display = 'none';
        } else {
            if (badgeContainer) badgeContainer.style.display = 'none';
            if (noOkWarning) noOkWarning.style.display = 'block';
            document.title = 'Pygmalion — Личный комбайн';
        }
    } catch (e) {
        console.error('[Ошибка] updateOKBadge:', e);
    }
}

function triggerOKBadgeGlow() {
    const badge = document.getElementById('ok-badge');
    if (badge) {
        badge.classList.add('emission-active');
        setTimeout(() => badge.classList.remove('emission-active'), 3000);
    }
}

// === СОХРАНЕНИЕ (через Storage) ===

function saveState() {
    try {
        return Storage.saveCrystalState({
            umBalance: AppState.umBalance,
            lastEmissionTime: AppState.lastEmissionTime,
            triadsUsed: AppState.triadsUsed,
            givenTotal: AppState.givenTotal,
            todayGiven: AppState.todayGiven,
            receivedTotal: AppState.receivedTotal,
            todayReceived: AppState.todayReceived,
            burnedTotal: AppState.burnedTotal,
            todayBurned: AppState.todayBurned,
            reputationWeight: AppState.reputationWeight,
            lastResetDate: AppState.lastResetDate,
            lastTriadsReset: AppState.lastTriadsReset,
            lastDailyPlannerReset: AppState.lastDailyPlannerReset,
            ueUnits: AppState.ueUnits,
            transactions: AppState.transactions,
            temporaries: AppState.temporaries || [],
            normUsedToday: AppState.normUsedToday,
            lastNormReset: AppState.lastNormReset
        });
    } catch (e) {
        console.error('[Ошибка] saveState:', e);
        return false;
    }
}

function loadState() {
    try {
        const data = Storage.loadCrystalState();

        AppState.umBalance = data.umBalance || 5;
        AppState.lastEmissionTime = data.lastEmissionTime || null;
        AppState.triadsUsed = data.triadsUsed || {};
        AppState.givenTotal = data.givenTotal || 0;
        AppState.todayGiven = data.todayGiven || 0;
        AppState.receivedTotal = data.receivedTotal || 0;
        AppState.todayReceived = data.todayReceived || 0;
        AppState.burnedTotal = data.burnedTotal || 0;
        AppState.todayBurned = data.todayBurned || 0;
        AppState.reputationWeight = data.reputationWeight || 0;
        AppState.lastResetDate = data.lastResetDate || null;
        AppState.lastTriadsReset = data.lastTriadsReset || null;
        AppState.lastDailyPlannerReset = data.lastDailyPlannerReset || null;
        AppState.ueUnits = data.ueUnits || [];
        AppState.transactions = data.transactions || [];
        AppState.temporaries = data.temporaries || [];
        AppState.normUsedToday = data.normUsedToday || { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
        AppState.lastNormReset = data.lastNormReset || null;
        // === Социальная архитектура (v0.3.24) ===
        AppState.membershipOrders = data.membershipOrders || [];
        AppState.membershipDepartments = data.membershipDepartments || [];
        AppState.unions = data.unions || [];
        AppState.councils = data.councils || [];
        AppState.statuses = data.statuses || { current: 'participant' };
        AppState.crossTransactions = data.crossTransactions || [];
        AppState.incomingValuations = data.incomingValuations || [];

        console.log('[loadState] Загружено через Storage, У.Е.:', getUEBalance());
        console.log(`[Статистика] T1=${AppState.normUsedToday.T1}, T2=${AppState.normUsedToday.T2}, T3=${AppState.normUsedToday.T3}, T4=${AppState.normUsedToday.T4}, T5=${AppState.normUsedToday.T5}`);
        console.log(`[loadState] Союзы: ${AppState.unions.length}, Советы: ${AppState.councils.length}`);
    } catch (e) {
        console.error('[Ошибка] loadState:', e);
    }
}

// === ОЦЕНКИ ВХОДЯЩИХ У.М. (Dropdown v0.3.24) ===

/**
 * Рендер dropdown оценок входящих У.М. в ::про.3.::
 * Вызывается при init() и после сохранения оценки
 */
function renderValuationsDropdown() {
    const container = document.getElementById('valuations-dropdown-content');
    if (!container) return;

    const state = Storage.loadCrystalState();
    const valuations = state.incomingValuations || [];
    const txs = AppState.transactions;

    if (valuations.length === 0) {
        container.innerHTML = '<p class="valuations-empty" data-i18n="valuations_empty">Оценок пока нет</p>';
        return;
    }

    // Рендерим оценки (новые сверху)
    const rows = valuations.slice().reverse().map(v => {
        const tx = txs[v.txIndex];
        if (!tx) return '';

        const time = new Date(tx.timestamp);
        const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const fromShort = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';
        const ueNum = tx.ueNumber ? `№${tx.ueNumber}` : (tx.ueIds ? `№${tx.ueIds.join(',')}` : '№—');

        // Цветовая классификация оценки
        const scoreNum = parseFloat(v.valuation);
        let scoreClass = 'mid';
        if (!isNaN(scoreNum)) {
            if (scoreNum >= 7) scoreClass = 'high';
            else if (scoreNum < 4) scoreClass = 'low';
        }

        const scoreDisplay = v.valuation || '—';
        const noteDisplay = tx.message ? `<span class="valuation-note">${tx.message}</span>` : '';

        return `<div class="valuation-entry">
          <span class="valuation-score ${scoreClass}">${scoreDisplay}</span>
          <div class="valuation-details">
            <span class="valuation-source">от ::${fromShort}:: · ${ueNum}</span>
            ${noteDisplay}
          </div>
          <span class="valuation-date">${ddmmyy} ${hhmm}</span>
        </div>`;
    }).filter(Boolean).join('');

    container.innerHTML = rows || '<p class="valuations-empty">Оценок пока нет</p>';
}

// === ОБЛИК (КОЛ-ЛИЦО-ОБЛИК) — мост от ro.DAG к Цветку ===

function updateDomainsFromDAR() {
    // Получаем последнее сгорание (граница цикла)
    const lastBurn = Storage.getLastBurnTimestamp();

    // Сброс доменов
    AppState.domains = {
        knowledge: 0,
        care: 0,
        creativity: 0,
        wisdom: 0,
        trust: 0,
        participation: 0,
        core: 0 // Фиолетовая метка — только после эмиссии+передачи №21
    };

    // Получаем все транзакции из ro.DAG
    const transfers = Storage.getDAGNodesByType('transfer');
    let hasUE21Transfer = false; // Флаг: была ли передача У.Е. №21

    transfers.forEach(node => {
        // Граница: только после последнего сгорания
        if (lastBurn && node.timestamp < lastBurn) {
            return;  // Пропускаем старые акты
        }

        // Считаем вес для каждого домена
        node.data.ueIds.forEach(ueId => {
            const ueNum = typeof ueId === 'string' ? parseInt(ueId, 10) : ueId;
            const triad = getTriadByUE(ueNum);
            if (triad && DOMAIN_MAP[triad]) {
                const weight = getUEWeight(ueNum);
                DOMAIN_MAP[triad].forEach(domain => {
                    AppState.domains[domain] += weight;
                });
            }
            // Проверяем была ли передача У.Е. №21 (строгое сравнение)
            if (ueNum === 21) {
                hasUE21Transfer = true;
            }
        });
    });

    // === ДОП. ПРОВЕРКА: ищем №21 в AppState.transactions (КАНОН v0.3.25) ===
    if (!hasUE21Transfer) {
        AppState.transactions.forEach(tx => {
            if (tx.type === 'transfer') {
                if (tx.ueIds && tx.ueIds.includes(21)) { hasUE21Transfer = true; }
                if (tx.ueNumber === 21) { hasUE21Transfer = true; }
            }
        });
    }

    // === ФИОЛЕТОВАЯ МЕТКА: только если эмиссия БЫЛА и передача У.Е. №21 ===
    const state = Storage.loadCrystalState();
    const hasEmission = state.lastEmissionTime !== null;
    if (hasEmission && hasUE21Transfer) {
        AppState.domains.core = 1; // Активируем свечение
    } else {
        AppState.domains.core = 0; // Гарантируем сброс
    }

    console.log(`[Облик] domains: ${JSON.stringify(AppState.domains)} | №21 передан: ${hasUE21Transfer} | эмиссия: ${hasEmission}`);

    // Обновляем визуал
    renderFlowerVisual();
}

// Визуализация Цветка с Human Design эффектами
function renderFlowerVisual() {
    Object.entries(AppState.domains).forEach(([domain, value]) => {
        const petal = document.querySelector(`[data-domain="${domain}"]`);
        if (!petal) return;
        
        // Clamp интенсивности для визуала (0.4 - 1.0)
        const intensity = Math.min(value / 13, 1);
        
        // Базовая видимость
        petal.style.opacity = 0.4 + (intensity * 0.6);
        
        // Пульсация для активных доменов
        if (value > 0) {
            petal.classList.add('active');
        } else {
            petal.classList.remove('active');
        }
        
        // Центр (T5) — СТРОГО ОДНА метка в центре, только при передаче №21
        if (domain === 'core') {
            const center = document.getElementById('flower-center');
            if (center) {
                // classList.toggle — гарантия от дублирования
                const isActive = value > 0;
                center.classList.toggle('core-active', isActive);
                if (isActive) {
                    center.style.fill = 'rgba(168, 85, 247, 0.4)';
                    center.style.stroke = 'var(--accent-purple)';
                    center.style.strokeWidth = '2';
                    center.style.filter = `drop-shadow(0 0 ${15 + (intensity * 10)}px rgba(168, 85, 247, ${0.5 + (intensity * 0.5)}))`;
                } else {
                    center.style.fill = '';
                    center.style.stroke = '';
                    center.style.strokeWidth = '';
                    center.style.filter = '';
                }
            }
        }
    });
    
    // Обновляем следы актов (hover)
    updatePetalHoverEffects();
}

// Обновление hover-эффектов со следами актов
function updatePetalHoverEffects() {
    ['knowledge', 'care', 'creativity', 'wisdom', 'trust', 'participation'].forEach(domain => {
        const petal = document.querySelector(`[data-domain="${domain}"]`);
        if (!petal) return;
        
        const lastActs = getLastActsForDomain(domain);
        if (lastActs.length > 0) {
            petal.setAttribute('data-last', lastActs.join(' | '));
        } else {
            petal.removeAttribute('data-last');
        }
    });
}

// Получить последние акты для домена (все У.Е. в акте)
function getLastActsForDomain(domain) {
    const allActs = Storage.getAllActs();
    
    const acts = allActs
        .filter(a => {
            if (a.type !== 'transfer') return false;
            
            // Проверяем ВСЕ У.Е. в акте
            const matches = a.data.ueIds.some(ueId => {
                const triad = getTriadByUE(ueId);
                return DOMAIN_MAP[triad]?.includes(domain);
            });
            
            return matches;
        })
        .slice(-3);  // Последние 3 акта
    
    return acts.map(a => a.data.message || 'акт признания');
}

// === РЕЕСТРЫ ===

// === ЗАПРЕТ САМОБЛАГОДАРНОСТИ (этика) ===

// === ЗАЩИТА: проверка О.К. перед действиями ===

function guardRequireOK() {
    const okKey = localStorage.getItem('pygmalion_ok_key');
    if (!okKey || okKey.trim().length < 3) {
        alert(I18N.t('alert_require_ok') || '⚠️ Необходим О.К. — пройдите Порог для получения числового следа');
        return false;
    }
    return true;
}

function isSelfGratitude(recipientOK) {
    const currentOK = localStorage.getItem('pygmalion_ok_key');
    return currentOK && currentOK === recipientOK;
}

// === ПРАВИЛО НОРМЫ (этика) ===
// Макс 5 У.Е. к отправке: по 1 из каждой триады + №21
// Учёт всех транзакций за текущий кон (накопительная норма)

function getAlreadySentTo(recipientOK) {
    const today = getInternalTime().toDateString();

    // Фильтруем транзакции за сегодня этому получателю
    const todayTxs = AppState.transactions.filter(tx =>
        tx.to === recipientOK &&
        new Date(tx.timestamp).toDateString() === today
    );

    // Извлекаем триады из переданных У.Е.
    const sentTriads = { T1: false, T2: false, T3: false, T4: false, T5: false };

    todayTxs.forEach(tx => {
        tx.ueIds.forEach(ueId => {
            const ue = AppState.ueUnits.find(u => u.id === ueId);
            if (ue) {
                sentTriads[ue.triad] = true;
                console.log(`[Норма] ${recipientOK}: уже получена триада ${ue.triad} (У.Е. №${ueId})`);
            }
        });
    });

    return sentTriads;
}

function filterByNormRule(selectedUEIds, alreadySentTriads) {
    const result = [];
    const triads = { T1: [], T2: [], T3: [], T4: [], T5: [] };
    
    // 1. Группировка по триадам
    selectedUEIds.forEach(id => {
        const ue = AppState.ueUnits.find(u => u.id === id);
        if (ue && triads[ue.triad]) {
            triads[ue.triad].push(id);
        }
    });
    
    // 2. Выбор min из каждой триады (T1-T4)
    //    НО: если триада уже была отправлена → пропускаем
    ['T1', 'T2', 'T3', 'T4'].forEach(triad => {
        if (triads[triad].length > 0 && !alreadySentTriads[triad]) {
            result.push(Math.min(...triads[triad]));
        } else if (triads[triad].length > 0 && alreadySentTriads[triad]) {
            console.log(`[Норма] Триада ${triad} уже была отправлена, пропускаем`);
        }
    });
    
    // 3. Добавить №21 если выбран (T5)
    if (triads.T5.length > 0 && !alreadySentTriads.T5) {
        result.push(21);
    } else if (triads.T5.length > 0 && alreadySentTriads.T5) {
        console.log(`[Норма] №21 уже был отправлен, пропускаем`);
    }
    
    return result; // Макс 5 У.Е.
}

function renderOKList(container) {
    if (!container) return;

    // Получаем текущий О.К.
    const currentOK = localStorage.getItem('pygmalion_ok_key');
    const okCreated = localStorage.getItem('pygmalion_ok_created');

    // Формируем дату для текущего О.К.
    let currentDate = '—';
    if (okCreated) {
        const date = new Date(okCreated);
        const month = date.toLocaleString('ru-RU', { month: 'long' });
        const year = date.getFullYear();
        currentDate = `${month} ${year} г.`;
    }

    // Создаём список: текущий О.К. + 12 тестовых
    const okList = [];
    if (currentOK && currentOK.length >= 3) {
        okList.push({ key: currentOK, date: currentDate, isCurrent: true });
    }
    TEST_OK_LIST.forEach(key => {
        okList.push({ key: key, date: I18N.t('test_label'), isCurrent: false });
    });

    // Рендерим список
    const rows = okList.map(ok => {
        const isSelf = isSelfGratitude(ok.key);
        const okClean = ok.key.replace(/::/g, '');
        const okColorized = colorizeOK(okClean);
        return `
        <div class="ok-list-item ${ok.isCurrent ? 'ok-list-current' : ''} ${isSelf ? 'ok-list-self' : ''}"
             data-ok="${ok.key}"
             style="padding: 10px; border-bottom: 1px solid var(--border-color); ${isSelf ? 'cursor: not-allowed; opacity: 0.5;' : 'cursor: pointer;'} display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: ${ok.isCurrent ? '700' : '400'}; font-size: 1rem;">::${okColorized}::</span>
                ${isSelf ? '<span style="color: var(--accent-red); font-size: 0.75rem;">⚠️ Нельзя себе</span>' : ''}
            </div>
            <span style="color: var(--text-muted); font-size: 0.85rem;">${ok.date}</span>
        </div>
    `}).join('');

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0;">
            ${rows}
        </div>
        <p class="registry-placeholder" style="margin-top: 1rem; font-size: 0.85rem;">
            Нажмите на О.К. чтобы выбрать получателя
        </p>
    `;

    // Обработчики кликов
    container.querySelectorAll('.ok-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const okKey = item.dataset.ok;
            
            // Проверка на самоблагодарность
            if (isSelfGratitude(okKey)) {
                showToast('Невозможно поблагодарить самого себя. Согласно канону, акт признания требует наличия Получателя.', 'error');
                return;  // Не закрывать окно, не выбирать
            }
            
            $('#recipient').value = okKey;
            closeOKListModal();
            console.log(`[Выбор О.К.] Получатель: ${okKey}`);
        });
    });
}

function closeOKListModal() {
    const okModal = document.getElementById('ok-list-modal');
    if (okModal) okModal.style.display = 'none';
}

function renderUzRegistry(container) {
    if (!container) return;
    const units = AppState.ueUnits;
    if (units.length === 0) {
        container.innerHTML = '<p class="registry-placeholder">Реестр пуст — У.З. ещё не создавались.</p>';
        return;
    }
    const rows = units.map(ue => {
        const statusLabel = { active: 'Активна', impulse: 'Импульс', burned: 'Сгорела', transferred: 'Передана' }[ue.status] || ue.status;
        const triadName = TRIADS[ue.triad]?.name || ue.triad;
        
        // Для переданных и сгоревших У.Е. показываем прочерк
        let burnDate = '—';
        if (ue.status === 'active' || ue.status === 'impulse') {
            burnDate = ue.burnAt ? new Date(ue.burnAt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
        }
        
        return `<tr>
            <td>№${ue.id}</td>
            <td>${triadName}</td>
            <td>${statusLabel}</td>
            <td>${burnDate}</td>
        </tr>`;
    }).join('');
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead><tr style="border-bottom:1px solid var(--border-color)">
                <th style="padding:6px;text-align:left">У.Е.</th>
                <th style="padding:6px;text-align:left">Триада</th>
                <th style="padding:6px;text-align:left">Статус</th>
                <th style="padding:6px;text-align:left">Сгорает</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// === ЛЕТОПИСЬ СВЕТОГОГО СЛЕДА (v0.3.19 «Канон Записи») ===

/**
 * Получение текущего О.К. пользователя
 * @returns {string} О.К. или '::—::' если не найден
 */
function getCurrentOK() {
    return (
        localStorage.getItem('pygmalion_ok_key') ||
        AppState?.currentOK ||
        '::—::'
    );
}

/**
 * Нормализация О.К. — оборачивание в ::...::
 * @param {string} okValue - значение О.К.
 * @returns {string} Нормализованный О.К. в формате ::О.К.::
 */
function normalizeOK(okValue) {
    if (!okValue || okValue === 'current_user') {
        okValue = getCurrentOK();
    }
    // Удаляем существующие :: и оборачиваем
    const clean = okValue.replace(/::/g, '').trim();
    return clean ? `::${clean}::` : '::—::';
}

/**
 * Цветное отображение О.К. (КАНОН v0.3.21)
 * Разбивает О.К. на символы и оборачивает каждый в <span> с цветом
 * @param {string} okKey - О.К. без ::
 * @returns {string} HTML с цветными символами
 */
function colorizeOK(okKey) {
    if (!okKey || okKey === '—') return okKey;
    
    // Карта цветов символов (КАНОН v0.3.21)
    const charColors = {
        // Русские уникальные (красные)
        'Ё': 'RED', 'Й': 'RED', 'Ц': 'RED', 'У': 'RED', 'К': 'RED', 'Е': 'RED',
        'Н': 'RED', 'Г': 'RED', 'Ш': 'RED', 'Щ': 'RED', 'З': 'RED', 'Х': 'RED',
        'Ъ': 'RED', 'Ф': 'RED', 'Ы': 'RED', 'В': 'RED', 'А': 'RED', 'П': 'RED',
        'Р': 'RED', 'О': 'RED', 'Л': 'RED', 'Д': 'RED', 'Ж': 'RED', 'Э': 'RED',
        'Я': 'RED', 'Ч': 'RED', 'С': 'RED', 'М': 'RED', 'И': 'RED', 'Т': 'RED',
        'Ь': 'RED', 'Б': 'RED', 'Ю': 'RED',
        // Латинские уникальные (синие) — только 14 букв
        'Q': 'BLUE', 'Z': 'BLUE', 'Y': 'BLUE', 'S': 'BLUE', 'U': 'BLUE',
        'F': 'BLUE', 'G': 'BLUE', 'J': 'BLUE', 'I': 'BLUE', 'W': 'BLUE',
        'V': 'BLUE', 'L': 'BLUE', 'N': 'BLUE', 'R': 'BLUE',
        // Общие буквы (зелёные) — есть в русском и латинском
        'X': 'GREEN', 'C': 'GREEN', 'T': 'GREEN', 'M': 'GREEN', 'O': 'GREEN',
        'A': 'GREEN', 'K': 'GREEN', 'E': 'GREEN', 'B': 'GREEN', 'H': 'GREEN',
        'P': 'GREEN',
        // Специальный символ (зелёный)
        '𝕯': 'GREEN'
    };
    
    // Разбиваем на символы (учитывая 𝕯 как 1 символ)
    const chars = [...okKey];
    
    return chars.map(char => {
        const color = charColors[char] || 'WHITE';
        const colorClass = color === 'RED' ? 'tx-char-red' :
                          (color === 'BLUE' ? 'tx-char-blue' :
                          (color === 'GREEN' ? 'tx-char-green' : 'tx-char-num'));
        return `<span class="${colorClass}">${char}</span>`;
    }).join('');
}

/**
 * Сборка канонической строки транзакции (v0.3.19)
 * Формат: #трек.время.дата.::О.К.::.№У.Е.::получатель.сообщение.поля...
 * @param {Object} tx - Объект транзакции из AppState
 * @param {number} trackNum - Номер трека (1,2,3...)
 * @returns {string} Каноническая строка
 */
function buildCanonicalRecord(tx, trackNum) {
    const time = new Date(tx.timestamp);
    const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const locale = AppState.currentLang === 'en' ? 'en-US' : 'ru-RU';
    const ddmmyy = time.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
    const track = `#${trackNum}`;

    // === НОРМАЛИЗАЦИЯ У.Е. ===
    // Поддержка обоих форматов: ueIds (массив) и ueNumber (число, для начальных транзакций)
    const ueSource = tx.ueIds || (tx.ueNumber ? [tx.ueNumber] : []);
    const ueList = ueSource
        .map(id => String(id).replace('№', '').trim())
        .filter(Boolean)
        .join(',');
    const ueFormatted = ueList ? `№${ueList}` : '№—';

    // === НОРМАЛИЗАЦИЯ СООБЩЕНИЯ ===
    const message = tx.message && tx.message.trim()
        ? `"${tx.message.trim()}"`
        : '"—"';

    // === О.К. ОТПРАВИТЕЛЯ (всегда ::О.К.::, цветной) ===
    const senderRaw = normalizeOK(tx.from).replace(/::/g, '');
    const sender = `<span class="tx-ok">::${colorizeOK(senderRaw)}::</span>`;

    // === ПОЛУЧАТЕЛЬ: «Благодаримый» — ::О.К.:: для участника ИЛИ имя для гостя ===
    const isMember = tx.to && tx.to.includes('::');
    let recipient;
    if (isMember) {
        // Участник: очищаем и оборачиваем в :: (цветной colorizeOK)
        const cleanOK = tx.to.replace(/::/g, '').trim();
        recipient = `<span class="tx-ok">::${colorizeOK(cleanOK)}::</span>`;
    } else {
        // Гость: просто имя без @ и без границ
        recipient = tx.to
            ? `<span class="acknowledged-guest">${tx.to}</span>`
            : `<span class="acknowledged-guest">—</span>`;
    }

    // === ПОДСКАЗКИ ВМЕСТО — (опциональные поля) ===
    const delivery = tx.deliveryTerm || '(срок доставки)';
    const valuation = tx.valuation || '(оценка ресурса)';
    // Дата выкупа — хранится в формате дд.мм.гг (КАНОН v0.3.24)
    const buyout = tx.buyoutDate || '(дата выкупа У.М.)';
    const ok3 = tx.ok3 || '(О.К.-3)';

    // === ВРЕМЕННЫЙ КЛЮЧ (только для гостей) ===
    let vkey = '';
    let isRIP = false;
    if (!isMember) {
        if (tx.temporaryKey === 'R.I.P.') {
            // Для R.I.P. показываем полные данные: имя и годы жизни
            const ripName = tx.to || '—';
            const ripYears = tx.ripYears || '—';
            vkey = `[R.I.P.${ripName}.${ripYears}.#/]`;
            isRIP = true;
        } else {
            // Для остальных временных ключей — маскируем
            vkey = tx.temporaryKey ? `[${maskTemporaryKey(tx.temporaryKey)}]` : '(в.К.)';
        }
    }

    // === СБОРКА СТРОКИ БЕЗ ПРОБЕЛОВ ===
    const parts = [
        track,
        hhmm,
        ddmmyy,
        sender,
        ueFormatted,
        recipient,
        message
    ];

    // Добавляем vkey только для гостей
    if (!isMember) {
        parts.push(vkey);
    }

    // Добавляем опциональные поля только если НЕ R.I.P.
    if (!isRIP) {
        parts.push(delivery, valuation, buyout, ok3);
    }

    return parts.join('.');
}

/**
 * Форматирует транзакцию в каноническую строку "Летописи" (устаревшая, v0.3.18)
 * @deprecated Использовать buildCanonicalRecord()
 * @param {Object} tx - Объект транзакции из AppState
 * @param {number} trackNum - Номер трека (1,2,3...)
 * @returns {string} Форматированная строка
 */
function formatTransactionRecord(tx, trackNum) {
    const time = new Date(tx.timestamp);
    const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const track = `#${trackNum}`;
    
    // === НОРМАЛИЗАЦИЯ У.Е. (пункт 5) ===
    const ueList = (tx.ueIds || [])
        .map(id => String(id).replace('№', '').trim())
        .filter(Boolean)
        .join(',');
    const ueFormatted = ueList ? `№${ueList}` : '—';
    
    // === НОРМАЛИЗАЦИЯ СООБЩЕНИЯ (пункт 6) ===
    const message = tx.message && tx.message.trim()
        ? `"${tx.message.trim()}"`
        : '"—"';
    
    // === О.К. ОТПРАВИТЕЛЯ (пункты 1,2) ===
    const sender = tx.from && tx.from !== 'current_user' 
        ? tx.from 
        : getCurrentOK();
    
    // === ПУСТЫЕ БЛОКИ (пункт 7) ===
    const delivery = tx.deliveryTerm || '—';
    const valuation = tx.valuation || '—';
    const buyout = tx.buyoutDate || '—';
    
    // === ВРЕМЕННЫЙ КЛЮЧ (для гостей) — МАСКИРОВАННЫЙ ===
    const vkey = tx.temporaryKey ? `[${maskTemporaryKey(tx.temporaryKey)}]` : '—';
    
    // Определение формата: Участник (Б) или Гость (А)
    const isMember = tx.to && tx.to.includes('::');
    
    if (isMember) {
        // Формат Б (участник): #трек . время . дата . sender . №UE . recipient . сообщение . срок . оценка . дата
        return `<div class="transaction-record format-b">
            ${track} . ${hhmm} . ${ddmmyy} . ${sender} . ${ueFormatted} . ${tx.to} . ${message} . ${delivery} . ${valuation} . ${buyout}
        </div>`;
    } else {
        // Формат А (гость): #трек . время . дата . sender . №UE . @ник . сообщение . [в.К.] . срок . оценка . дата
        const recipient = tx.to ? `@${tx.to}` : '@—';
        return `<div class="transaction-record format-a">
            ${track} . ${hhmm} . ${ddmmyy} . ${sender} . ${ueFormatted} . ${recipient} . ${message} . ${vkey} . ${delivery} . ${valuation} . ${buyout}
        </div>`;
    }
}

function renderTransactionsRegistry(container) {
    if (!container) return;
    const txs = AppState.transactions;

    if (txs.length === 0) {
        container.innerHTML = '<p class="registry-placeholder">Летопись пуста — следов ещё не было.</p>';
        return;
    }

    // Сортировка по убыванию timestamp (новые сверху)
    const sortedTxs = txs.slice().reverse();

    // === ПОРЯДОК ТРЕКОВ: 1,2,3... (пункт 3) ===
    const total = sortedTxs.length;

    // Генерация цепочки записей с checkbox (v0.3.26)
    const chain = sortedTxs.map((tx, idx) => {
        const trackNum = total - idx;  // 1 внизу, N наверху
        const record = buildCanonicalRecord(tx, trackNum);
        const txIndex = txs.indexOf(tx);
        const isRIP = tx.temporaryKey === 'R.I.P.';

        return `<div class="chronicle-row" data-tx-index="${txIndex}">
            <input type="checkbox" class="tx-checkbox" data-tx-index="${txIndex}" ${isRIP ? 'data-is-rip="true"' : ''}>
            <div class="chronicle-content">${record}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="registry-toolbar">
            <button class="btn-registry-action" id="btn-copy-selected" disabled>📋 Копировать выбранное</button>
            <button class="btn-registry-action" id="btn-dispute-selected" disabled>⚠️ Открыть спор</button>
        </div>
        <div class="transaction-chain">
            ${chain}
        </div>
        <p class="registry-note" style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-muted);">
            Показаны все транзакции в хронологическом порядке (новые сверху). Выберите транзакции для копирования или спора.
        </p>
    `;

    // Обработчики checkbox
    const checkboxes = container.querySelectorAll('.tx-checkbox');
    const btnCopy = container.querySelector('#btn-copy-selected');
    const btnDispute = container.querySelector('#btn-dispute-selected');

    function updateButtons() {
        const selected = Array.from(checkboxes).filter(cb => cb.checked);
        const hasRIP = selected.some(cb => cb.dataset.isRip === 'true');

        btnCopy.disabled = selected.length === 0;
        btnDispute.disabled = selected.length === 0 || hasRIP;

        if (hasRIP && selected.length > 0) {
            btnDispute.title = 'Споры для R.I.P. транзакций запрещены';
        } else {
            btnDispute.title = 'Открыть спор по выбранным транзакциям';
        }
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateButtons);
    });

    // Кнопка копирования
    btnCopy.addEventListener('click', () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked);
        const links = selected.map(cb => {
            const txIndex = parseInt(cb.dataset.txIndex);
            return generateTransactionLink(txIndex);
        });

        const text = links.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Скопировано ${selected.length} транзакций`, 'success');
        }).catch(() => {
            showToast('Ошибка копирования', 'error');
        });
    });

    // Кнопка спора
    btnDispute.addEventListener('click', () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked && cb.dataset.isRip !== 'true');
        if (selected.length === 0) return;

        const links = selected.map(cb => {
            const txIndex = parseInt(cb.dataset.txIndex);
            return generateDisputeLink(txIndex);
        });

        const text = `Спорные транзакции:\n\n${links.join('\n')}`;
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Скопировано ${selected.length} ссылок на споры`, 'success');
            alert(`Ссылки на споры скопированы в буфер обмена.\n\nОтправьте их администратору или в техподдержку.`);
        }).catch(() => {
            showToast('Ошибка копирования', 'error');
        });
    });
}

/**
 * Генерация ссылки на транзакцию для копирования (v0.3.26)
 * Формат для участников: wek.o/#трек.время.дата.::отправитель::.№У.Е.::получатель.сообщение.срок.оценка.выкуп.ОК3/.
 * Формат для RIP: wek.o/#трек.время.дата.::отправитель::.№У.Е.RIP.Имя.Годы.Сообщение.#/.
 */
function generateTransactionLink(txIndex) {
    const tx = AppState.transactions[txIndex];
    if (!tx) return '';

    const time = new Date(tx.timestamp);
    const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\./g, '.');

    const trackNum = AppState.transactions.length - txIndex;
    const fromOK = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';

    const ueSource = tx.ueIds || (tx.ueNumber ? [tx.ueNumber] : []);
    const ueList = ueSource.map(id => String(id).replace('№', '').trim()).filter(Boolean).join(',');
    const ueFormatted = ueList ? `№${ueList}` : '№—';

    const message = tx.message || '—';

    if (tx.temporaryKey === 'R.I.P.') {
        // Формат RIP
        const recipient = tx.to || '—';
        const years = tx.ripYears || '—';
        return `wek.o/#${trackNum}.${hhmm}.${ddmmyy}.::${fromOK}::.${ueFormatted}.RIP.${recipient}.${years}.${message}.#/`;
    } else {
        // Формат для участников и гостей
        const isMember = tx.to && tx.to.includes('::');
        const recipient = isMember ? `::${normalizeOK(tx.to).replace(/::/g, '')}::` : `${tx.to}`;
        const delivery = tx.deliveryTerm || '(срок)';
        const valuation = tx.valuation || '(оценка)';
        const buyout = tx.buyoutDate || '(выкуп)';
        const ok3 = tx.ok3 || '(ОК3)';

        return `wek.o/#${trackNum}.${hhmm}.${ddmmyy}.::${fromOK}::.${ueFormatted}.${recipient}.${message}.${delivery}.${valuation}.${buyout}.${ok3}/`;
    }
}

/**
 * Генерация ссылки на спор (v0.3.26)
 */
function generateDisputeLink(txIndex) {
    const tx = AppState.transactions[txIndex];
    if (!tx) return '';

    const time = new Date(tx.timestamp);
    const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\./g, '.');

    const trackNum = AppState.transactions.length - txIndex;
    const fromOK = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';

    const ueSource = tx.ueIds || (tx.ueNumber ? [tx.ueNumber] : []);
    const ueList = ueSource.map(id => String(id).replace('№', '').trim()).filter(Boolean).join(',');
    const ueFormatted = ueList ? `№${ueList}` : '№—';

    const disputeCode = generateDisputeCode();

    // Получатель
    const isMember = tx.to && tx.to.includes('::');
    const recipient = isMember ? `::${normalizeOK(tx.to).replace(/::/g, '')}::` : `${tx.to}`;

    const message = tx.message || '—';
    const delivery = tx.deliveryTerm || '(срок)';
    const valuation = tx.valuation || '(оценка)';
    const buyout = tx.buyoutDate || '(выкуп)';
    const ok3 = tx.ok3 || '(ОК3)';

    return `wek.o/#${trackNum}.${hhmm}.${ddmmyy}.::${fromOK}::.${ueFormatted}.${recipient}.${disputeCode}.${message}.${delivery}.${valuation}.${buyout}.${ok3}/`;
}

/**
 * Обновление даты последней активности (v0.3.26)
 * Вызывается при успешной трансформации У.Е. → У.М.
 */
function updateActivityDate() {
    const state = Storage.loadCrystalState();
    const today = new Date().toDateString();

    state.lastActivityDate = today;
    state.inactiveDays = 0;  // Сброс счётчика при активности

    Storage.saveCrystalState(state);
    console.log('[Activity] Дата активности обновлена:', today);
}

/**
 * Подсчёт дней бездействия (v0.3.26)
 * Вызывается ежедневно в 04:00 при сбросе показателей
 */
function updateInactivityCounter() {
    const state = Storage.loadCrystalState();

    if (!state.lastActivityDate) {
        // Первый запуск — устанавливаем текущую дату
        state.lastActivityDate = new Date().toDateString();
        state.inactiveDays = 0;
        Storage.saveCrystalState(state);
        return;
    }

    const lastActivity = new Date(state.lastActivityDate);
    const today = new Date();
    const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));

    if (daysDiff > 0) {
        state.inactiveDays = daysDiff;
        Storage.saveCrystalState(state);

        console.log(`[Activity] Дней бездействия: ${daysDiff}`);

        // Порог 87 дней — только логирование, без UI-давления
        if (daysDiff >= 87) {
            console.warn(`[Activity] О.К. неактивен ${daysDiff} дней (порог: 87). Пометка для backend.`);
        }
    }
}

/**
 * Открыть спор по транзакции → копия в wek.o/ (v0.3.25)
 * Генерирует ссылку: wek.o/#<track>.<hhmm>:<ddmmyy>.::<fromOK>::.№<ue>.::<disputeCode>::."—".(срок).(оценка).(дата выкупа).(О.К.-3)
 */
function openDispute(txIndex) {
    const tx = AppState.transactions[txIndex];
    if (!tx) {
        showToast('Транзакция не найдена', 'error');
        return;
    }

    const time = new Date(tx.timestamp);
    const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

    // Определяем номер трека (обратный отсчёт)
    const trackNum = AppState.transactions.length - txIndex;

    // У.Е.
    const ueSource = tx.ueIds || (tx.ueNumber ? [tx.ueNumber] : []);
    const ueList = ueSource.map(id => String(id).replace('№', '').trim()).filter(Boolean).join(',');
    const ueFormatted = ueList ? `№${ueList}` : '№—';

    // Отправитель
    const fromOK = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';

    // Код спора — генерируем уникальный идентификатор
    const disputeCode = generateDisputeCode();

    // Получатель
    const isMember = tx.to && tx.to.includes('::');
    const recipient = isMember ? `::${normalizeOK(tx.to).replace(/::/g, '')}::` : `${tx.to}`;

    // Сообщение
    const message = tx.message || '—';

    // Опциональные поля
    const delivery = tx.deliveryTerm || '(срок доставки)';
    const valuation = tx.valuation || '(оценка ресурса)';
    const buyout = tx.buyoutDate || '(дата выкупа У.М.)';
    const ok3 = tx.ok3 || '(О.К.-3)';

    // Формируем ссылку спора
    const disputeLink = `wek.o/#${trackNum}.${hhmm}:${ddmmyy}.::${fromOK}::.${ueFormatted}.${recipient}.${disputeCode}.${message}.${delivery}.${valuation}.${buyout}.${ok3}`;

    // Сохраняем спор в localStorage
    const disputes = loadDisputes();
    const dispute = {
        id: Date.now(),
        txIndex: txIndex,
        disputeCode: disputeCode,
        link: disputeLink,
        originalTx: JSON.parse(JSON.stringify(tx)),
        createdAt: new Date().toISOString(),
        status: 'open'
    };
    disputes.push(dispute);
    saveDisputes(disputes);

    // Копируем ссылку в буфер обмена
    navigator.clipboard.writeText(disputeLink).then(() => {
        showToast(`⚠️ Спор открыт! Ссылка скопирована:\n${disputeLink}`, 'info');
    }).catch(() => {
        showToast(`⚠️ Спор открыт! Ссылка:\n${disputeLink}`, 'info');
    });

    console.log(`[Спор] Открыт: ${disputeLink}`);
}

/**
 * Генерация уникального кода спора (6 символов: буквы + цифры)
 */
function generateDisputeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '0';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/**
 * Загрузить споры из localStorage
 */
function loadDisputes() {
    try {
        const data = localStorage.getItem('pygmalion_disputes_o0');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Сохранить споры в localStorage
 */
function saveDisputes(disputes) {
    try {
        localStorage.setItem('pygmalion_disputes_o0', JSON.stringify(disputes));
    } catch (e) {
        console.error('[Спор] Ошибка сохранения:', e);
    }
}

/**
 * Рендер редактируемого архива входящих У.М. (v0.3.25)
 * Все входящие транзакции (type === 'received' или to === текущий О.К.)
 * Поле valuation редактируемое
 */
function renderIncomingArchive(container) {
    if (!container) return;
    const currentOK = getCurrentOK();
    const allTxs = AppState.transactions;

    // Фильтруем входящие транзакции
    const incomingTxs = allTxs.filter(tx => {
        if (tx.type === 'received') return true;
        if (tx.to && tx.to.includes('::')) {
            return tx.to.replace(/::/g, '') === currentOK.replace(/::/g, '');
        }
        return false;
    });

    if (incomingTxs.length === 0) {
        container.innerHTML = '<p class="registry-placeholder">Входящих У.М. пока нет.</p>';
        return;
    }

    // Сортировка: новые сверху
    const sortedTxs = incomingTxs.slice().reverse();

    const rows = sortedTxs.map((tx) => {
        const time = new Date(tx.timestamp);
        const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const ueNum = tx.ueNumber ? `№${tx.ueNumber}` : (tx.ueIds ? `№${tx.ueIds.join(',')}` : '№—');
        const fromShort = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';
        const valuation = tx.valuation || '';
        const isMember = tx.to && tx.to.includes('::');
        // Полный в.К. — только для гостевых транзакций (владелец видит для связи)
        const vkeyFull = (!isMember && tx.temporaryKey) ? tx.temporaryKey : '';
        // Найти индекс транзакции в основном массиве для сохранения
        const txIndex = allTxs.indexOf(tx);

        return `<div class="incoming-archive-row" data-tx-index="${txIndex}">
          <div class="incoming-row-header">
            <span class="incoming-meta">${ddmmyy} ${hhmm} · от ::${fromShort}:: · ${ueNum}</span>
          </div>
          <div class="incoming-row-body">
            <label class="incoming-label">${I18N.t('label_valuation')}</label>
            <input type="text" class="incoming-valuation-input"
                   data-tx-index="${txIndex}"
                   value="${valuation}"
                   placeholder="(оценка ресурса)" />
            <button class="btn-save-valuation" data-tx-index="${txIndex}">💾</button>
            ${vkeyFull ? `<span class="incoming-vkey-label">в.К. (полный):</span>
            <span class="incoming-vkey-value" data-tx-index="${txIndex}">${vkeyFull}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="incoming-archive-list">
        ${rows}
      </div>
      <p class="registry-note" style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-muted);">
        ${I18N.t('registry_incoming_note', {count: incomingTxs.length})}
      </p>
    `;

    // Навешиваем обработчики сохранения
    container.querySelectorAll('.btn-save-valuation').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.txIndex);
            const input = container.querySelector(`.incoming-valuation-input[data-tx-index="${idx}"]`);
            if (input && idx >= 0 && idx < allTxs.length) {
                allTxs[idx].valuation = input.value.trim() || null;

                // === v0.3.24: Сохранение оценки в incomingValuations ===
                const state = Storage.loadCrystalState();
                if (!state.incomingValuations) state.incomingValuations = [];
                const existingIdx = state.incomingValuations.findIndex(v => v.txIndex === idx);
                const valuationEntry = {
                    txIndex: idx,
                    valuation: input.value.trim() || null,
                    setAt: Date.now(),
                    setBy: localStorage.getItem('pygmalion_ok_key') || 'unknown'
                };
                if (existingIdx >= 0) {
                    state.incomingValuations[existingIdx] = valuationEntry;
                } else {
                    state.incomingValuations.push(valuationEntry);
                }
                Storage.saveCrystalState(state);

                saveState();
                showToast('Оценка сохранена', 'success');

                // Обновляем dropdown оценок
                renderValuationsDropdown();

                // Перерисовываем летопись
                const txModalContent = document.getElementById('transactions-registry-content');
                if (txModalContent && document.getElementById('transactions-registry-modal').style.display === 'flex') {
                    renderTransactionsRegistry(txModalContent);
                }
            }
        });
    });

    // Enter для сохранения
    container.querySelectorAll('.incoming-valuation-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const btn = container.querySelector(`.btn-save-valuation[data-tx-index="${input.dataset.txIndex}"]`);
                if (btn) btn.click();
            }
        });
    });
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
    });
    currentModal = null;
    console.log('[Модальные окна] Все закрыты');
}

function openModal(modalId) {
    closeAllModals();
    currentModal = modalId;
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        console.log(`[Модальные окна] Открыто: ${modalId}`);
    }
}

// === ИНИЦИАЛИЗАЦИЯ РЕЕСТРОВ И МОДАЛОК ===

function initRegistries() {
    // Кнопка "Список всех О.К." (Получатель)
    const openOk = document.getElementById('recipient-label');
    const okModal = document.getElementById('ok-list-modal');
    const okContent = document.getElementById('ok-list-content');
    const closeOk = document.getElementById('close-ok-list');

    if (openOk && okModal && okContent) {
        openOk.addEventListener('click', () => {
            renderOKList(okContent);
            openModal('ok-list-modal');
        });
    }
    if (closeOk && okModal) {
        closeOk.addEventListener('click', () => { okModal.style.display = 'none'; currentModal = null; });
    }
    if (okModal) {
        okModal.addEventListener('click', (e) => {
            if (e.target === okModal) { okModal.style.display = 'none'; currentModal = null; }
        });
    }

    // Кнопка "Все твои У.Е. на сегодня"
    const openUz = document.getElementById('open-uz-registry');
    const uzModal = document.getElementById('uz-registry-modal');
    const uzContent = document.getElementById('uz-registry-content');
    const closeUz = document.getElementById('close-uz-registry');

    if (openUz && uzModal && uzContent) {
        openUz.addEventListener('click', () => {
            renderUzRegistry(uzContent);
            openModal('uz-registry-modal');
        });
    }
    if (closeUz && uzModal) {
        closeUz.addEventListener('click', () => { uzModal.style.display = 'none'; currentModal = null; });
    }
    if (uzModal) {
        uzModal.addEventListener('click', (e) => {
            if (e.target === uzModal) { uzModal.style.display = 'none'; currentModal = null; }
        });
    }

    // Кнопка "Реестр всех транзакций"
    const openTx = document.getElementById('open-transactions-registry');
    const txModal = document.getElementById('transactions-registry-modal');
    const txContent = document.getElementById('transactions-registry-content');
    const closeTx = document.getElementById('close-transactions-registry');

    if (openTx && txModal && txContent) {
        openTx.addEventListener('click', () => {
            renderTransactionsRegistry(txContent);
            openModal('transactions-registry-modal');
        });
    }
    if (closeTx && txModal) {
        closeTx.addEventListener('click', () => { txModal.style.display = 'none'; currentModal = null; });
    }
    if (txModal) {
        txModal.addEventListener('click', (e) => {
            if (e.target === txModal) { txModal.style.display = 'none'; currentModal = null; }
        });
    }

    // === МОДАЛЬНОЕ ОКНО РЕДАКТИРУЕМОГО АРХИВА ВХОДЯЩИХ У.М. (v0.3.25) ===
    const openIncomingArchive = document.getElementById('open-incoming-archive');
    const incomingArchiveModal = document.getElementById('incoming-archive-modal');
    const incomingArchiveContent = document.getElementById('incoming-archive-content');
    const closeIncomingArchive = document.getElementById('close-incoming-archive');

    if (openIncomingArchive && incomingArchiveModal && incomingArchiveContent) {
        openIncomingArchive.addEventListener('click', () => {
            renderIncomingArchive(incomingArchiveContent);
            openModal('incoming-archive-modal');
        });
    }
    if (closeIncomingArchive && incomingArchiveModal) {
        closeIncomingArchive.addEventListener('click', () => { incomingArchiveModal.style.display = 'none'; currentModal = null; });
    }
    if (incomingArchiveModal) {
        incomingArchiveModal.addEventListener('click', (e) => {
            if (e.target === incomingArchiveModal) { incomingArchiveModal.style.display = 'none'; currentModal = null; }
        });
    }

    // === МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ПЕРЕДАЧИ (v0.3.19) ===
    const closeTransferConfirm = document.getElementById('close-transfer-confirm');
    const cancelTransfer = document.getElementById('cancel-transfer');
    const confirmTransferBtn = document.getElementById('confirm-transfer-btn');
    const headerConfirmTransferBtn = document.getElementById('header-confirm-transfer-btn');  // v0.3.21
    const transferConfirmModal = document.getElementById('transfer-confirm-modal');

    if (closeTransferConfirm) {
        closeTransferConfirm.addEventListener('click', closeTransferConfirmModal);
    }
    if (cancelTransfer) {
        cancelTransfer.addEventListener('click', closeTransferConfirmModal);
    }
    if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', confirmTransfer);
    }
    // v0.3.21: Кнопка подтверждения в шапке
    if (headerConfirmTransferBtn) {
        headerConfirmTransferBtn.addEventListener('click', confirmTransfer);
    }
    if (transferConfirmModal) {
        transferConfirmModal.addEventListener('click', (e) => {
            if (e.target === transferConfirmModal) { closeTransferConfirmModal(); }
        });
    }

    // Инициализация обработчика выбора причины благодарности
    initGratitudeReasonHandler();
}

// === ПАНЕЛЬ РАЗРАБОТЧИКА ===

function initDevPanel() {
    const toggle = document.getElementById('toggle-dev-panel');
    const content = document.getElementById('dev-panel-content');
    if (toggle && content) {
        toggle.addEventListener('click', () => {
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Тестовое время
    // ...

    // === Каркас кросс-транзакций (v0.3.24, резерв номеров) ===
    initCrossTransactionFramework();
}

/**
 * Инициализация каркаса кросс-транзакций (резерв номеров)
 * Резервирует: №s0 (1 шт.), №𝕯0-№𝕯99 (100 шт.), №с0-№с999 (1000 шт.)
 * Логика кросс-транзакций — отложена до v2.0.0
 */
function initCrossTransactionFramework() {
    const state = Storage.loadCrystalState();
    if (!state.reservedNumbers) {
        state.reservedNumbers = {
            s0: { used: false },  // Сердечная половина (1 шт.)
            d: {},                 // №𝕯0 - №𝕯99 (100 шт.)
            c: {}                  // №с0 - №с999 (1000 шт.)
        };
    }

    // Инициализация пустых слотов
    if (Object.keys(state.reservedNumbers.d).length === 0) {
        for (let i = 0; i <= 99; i++) {
            state.reservedNumbers.d[i] = { used: false, id: `№𝕯${i}` };
        }
    }
    if (Object.keys(state.reservedNumbers.c).length === 0) {
        for (let i = 0; i <= 999; i++) {
            state.reservedNumbers.c[i] = { used: false, id: `№с${i}` };
        }
    }

    if (!state.crossTransactions) state.crossTransactions = [];

    Storage.saveCrystalState(state);
    console.log('[Кросс-транзакции] Каркас инициализирован:', {
        s0: 'зарезервирован',
        d: '100 слотов',
        c: '1000 слотов'
    });
}

// Продолжение initDevPanel — тестовое время
function initDevTimeButtons() {
    document.querySelectorAll('.btn-dev-time').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeValue = btn.dataset.time;
            const timeOffset = btn.dataset.timeOffset;
            const status = document.getElementById('dev-time-status');

            if (timeOffset) {
                const match = timeOffset.match(/([+-])(\d+)(min|h)/);
                if (match) {
                    const sign = match[1] === '+' ? 1 : -1;
                    const val = parseInt(match[2]);
                    const unit = match[3] === 'h' ? 3600000 : 60000;
                    window.__testTimeOffset = (window.__testTimeOffset || 0) + sign * val * unit;
                    
                    // Отображение смещения
                    const totalMin = Math.round(window.__testTimeOffset / 60000);
                    const hours = Math.floor(Math.abs(totalMin) / 60);
                    const mins = Math.abs(totalMin) % 60;
                    const signStr = totalMin >= 0 ? '+' : '-';
                    
                    if (status) {
                        if (hours > 0) {
                            status.textContent = `Смещение: ${signStr}${hours}ч ${mins}мин`;
                        } else {
                            status.textContent = `Смещение: ${signStr}${mins} мин`;
                        }
                        status.style.color = totalMin !== 0 ? 'var(--accent-yellow)' : '';
                    }
                }
                return;
            }

            if (timeValue) {
                const [hours, minutes] = timeValue.split(':').map(Number);
                const now = new Date();
                const testTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
                window.__testTimeOffset = testTime.getTime() - now.getTime();
                if (status) {
                    status.textContent = `Тестовое время: ${timeValue}`;
                    status.style.color = 'var(--accent-yellow)';
                }
            }
        });
    });

    const resetTime = document.getElementById('reset-time');
    if (resetTime) {
        resetTime.addEventListener('click', () => {
            window.__testTimeOffset = null;
            const status = document.getElementById('dev-time-status');
            if (status) { status.textContent = 'Реальное время'; status.style.color = ''; }
        });
    }

    const clearStorage = document.getElementById('clear-storage');
    if (clearStorage) {
        clearStorage.addEventListener('click', () => {
            if (confirm('Очистить ВСЁ состояние?')) { localStorage.clear(); location.reload(); }
        });
    }

    const resetOk = document.getElementById('reset-ok-key');
    if (resetOk) {
        resetOk.addEventListener('click', () => {
            if (confirm('Сбросить О.К.?')) {
                localStorage.removeItem('pygmalion_ok_key');
                localStorage.removeItem('pygmalion_ok_created');
                updateOKBadge();
            }
        });
    }

    const resetOkMulti = document.getElementById('reset-ok-multi');
    if (resetOkMulti) {
        resetOkMulti.addEventListener('click', () => {
            localStorage.removeItem('pygmalion_ok_key');
            updateOKBadge();
        });
    }

    const resetTriadSel = document.getElementById('reset-triad-selection');
    if (resetTriadSel) {
        resetTriadSel.addEventListener('click', () => {
            window.__selectedTriads = [];
            document.querySelectorAll('.triad-btn, .special-btn').forEach(b => b.classList.remove('selected'));
            console.log('[Dev] Выбор триад сброшен');
        });
    }
}

// === ИНИЦИАЛИЗАЦИЯ ===

/**
 * fixInitialGiftOK() — исправляет О.К. в начальных 5 транзакциях
 * Если initialGiftGiven === true и есть реальный pygmalion_ok_key,
 * обновляет поле `to` во всех isInitialGift транзакциях.
 */
function fixInitialGiftOK() {
    const okKey = localStorage.getItem('pygmalion_ok_key');
    if (!okKey) return; // Ключ ещё не создан

    const state = Storage.loadCrystalState();
    if (!state.initialGiftGiven) return; // Начальные У.М. ещё не записаны

    const fixedOK = `::${okKey.replace(/::/g, '').trim()}::`;
    let changed = 0;

    state.transactions.forEach(tx => {
        if (tx.isInitialGift && tx.to !== fixedOK) {
            tx.to = fixedOK;
            changed++;
        }
    });

    if (changed > 0) {
        Storage.saveCrystalState(state);
        console.log(`[fixInitialGiftOK] Обновлено ${changed} начальных транзакций → ${fixedOK}`);
    }
}

/**
 * Инициализация кнопки музыки (v0.3.25)
 * Placeholder для будущей интеграции аудио
 */
function initMusicToggle() {
    const musicBtn = document.getElementById('music-toggle');
    if (!musicBtn) return;

    // Путь к музыке в репозитории GitHub Pages
    const audio = new Audio('/-Pygmalion-/assets/audio/olegDal.tmp');
    audio.loop = true;
    audio.volume = 0.5;

    let isPlaying = false;

    musicBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;

        if (isPlaying) {
            audio.play().then(() => {
                musicBtn.classList.add('active');
                musicBtn.title = 'Выключить музыку';
                console.log('[Музыка] Включена: Олег Даль - Есть только миг');
            }).catch(err => {
                console.error('[Музыка] Ошибка воспроизведения:', err);
                isPlaying = false;
            });
        } else {
            audio.pause();
            musicBtn.classList.remove('active');
            musicBtn.title = 'Включить музыку';
            console.log('[Музыка] Выключена');
        }
    });
}

/**
 * Переключение вкладок временного ключа (в.К.)
 * @param {string} tabName - Имя вкладки: 'rip', 'phone', 'email', 'phone-email'
 */
let currentVKTab = 'rip';

function switchVKTab(tabName) {
    currentVKTab = tabName;

    // Переключаем активную вкладку
    document.querySelectorAll('.vk-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Переключаем контент вкладок
    document.querySelectorAll('.vk-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Скрываем/показываем поля в зависимости от типа вкладки
    const optionalFieldsBlock = document.querySelector('.transfer-fields--optional');

    if (tabName === 'rip') {
        // Для RIP скрываем весь блок опциональных полей
        if (optionalFieldsBlock) optionalFieldsBlock.style.display = 'none';
    } else {
        // Для остальных показываем блок опциональных полей
        if (optionalFieldsBlock) optionalFieldsBlock.style.display = 'block';
    }
}

/**
 * Инициализация обработчиков вкладок временного ключа
 */
function initVKTabs() {
    document.querySelectorAll('.vk-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchVKTab(tab.dataset.tab);
        });
    });
}

// === ACT 1 TABS (v0.3.26) ===

/**
 * Переключение вкладок в Акте 1
 */
function switchAct1Tab(tabName) {
    // Переключаем активную вкладку
    document.querySelectorAll('.act1-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Переключаем контент вкладок
    document.querySelectorAll('.act1-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    // Инициализация контента при первом открытии
    if (tabName === 'daily' && !window.dailyPlannerInitialized) {
        initDailyPlanner();
        window.dailyPlannerInitialized = true;
    } else if (tabName === 'weekly' && !window.weeklyPlannerInitialized) {
        initWeeklyPlanner();
        window.weeklyPlannerInitialized = true;
    }
}

/**
 * Инициализация обработчиков вкладок Акта 1
 */
function initAct1Tabs() {
    document.querySelectorAll('.act1-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchAct1Tab(tab.dataset.tab);
        });
    });
}

/**
 * Инициализация ежедневника
 */
function initDailyPlanner() {
    const timeline = document.getElementById('daily-timeline');
    if (!timeline) return;

    // Генерация временных слотов с 04:00 до 23:00
    const hours = [];
    for (let h = 4; h <= 23; h++) {
        hours.push(h);
    }
    // Добавляем 00:00
    hours.push(0);

    const slots = hours.map(hour => {
        const hourStr = String(hour).padStart(2, '0') + ':00';
        const slotId = `task-${hour}`;

        return `
            <div class="timeline-slot">
                <div class="timeline-hour">${hourStr}</div>
                <input type="text"
                       class="timeline-task"
                       id="${slotId}"
                       placeholder="Задача на этот час..."
                       data-hour="${hour}">
                <button class="task-save-btn" onclick="saveDailyTask(${hour})">💾</button>
            </div>
        `;
    }).join('');

    timeline.innerHTML = slots;

    // Загрузка сохраненных задач
    loadDailyTasks();
}

/**
 * Сохранение задачи ежедневника
 */
function saveDailyTask(hour) {
    const input = document.getElementById(`task-${hour}`);
    if (!input) return;

    const task = input.value.trim();
    const today = new Date().toDateString();

    let dailyTasks = JSON.parse(localStorage.getItem('pygmalion_daily_tasks') || '{}');

    if (!dailyTasks[today]) {
        dailyTasks[today] = {};
    }

    dailyTasks[today][hour] = task;
    localStorage.setItem('pygmalion_daily_tasks', JSON.stringify(dailyTasks));

    showToast('Задача сохранена', 'success');
}

/**
 * Загрузка задач ежедневника
 */
function loadDailyTasks() {
    const today = new Date().toDateString();
    const dailyTasks = JSON.parse(localStorage.getItem('pygmalion_daily_tasks') || '{}');

    if (dailyTasks[today]) {
        Object.keys(dailyTasks[today]).forEach(hour => {
            const input = document.getElementById(`task-${hour}`);
            if (input) {
                input.value = dailyTasks[today][hour];
            }
        });
    }
}

/**
 * Очистка ежедневника в полночь
 */
function clearDailyTasks() {
    const today = new Date().toDateString();
    const dailyTasks = JSON.parse(localStorage.getItem('pygmalion_daily_tasks') || '{}');

    // Перенос в историю
    let history = JSON.parse(localStorage.getItem('pygmalion_daily_history') || '[]');
    if (dailyTasks[today]) {
        history.push({
            date: today,
            tasks: dailyTasks[today]
        });
        localStorage.setItem('pygmalion_daily_history', JSON.stringify(history));
    }

    // Очистка текущего дня
    delete dailyTasks[today];
    localStorage.setItem('pygmalion_daily_tasks', JSON.stringify(dailyTasks));

    console.log('[00:00] Ежедневник очищен, задачи перенесены в историю');
}

/**
 * Инициализация еженедельника
 */
function initWeeklyPlanner() {
    const calendar = document.getElementById('weekly-calendar');
    if (!calendar) return;

    const today = new Date();
    const weeks = [];

    // Генерация 4 недель
    for (let w = 0; w < 4; w++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + (w * 7));

        const weekDays = [];
        for (let d = 0; d < 7; d++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + d);
            weekDays.push(day);
        }

        weeks.push({
            number: w + 1,
            days: weekDays
        });
    }

    const weeksHTML = weeks.map(week => {
        const daysHTML = week.days.map(day => {
            const dateStr = day.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            const dayName = day.toLocaleDateString('ru-RU', { weekday: 'short' });
            const dateKey = day.toDateString();

            return `
                <div class="day-slot" onclick="openDayEvents('${dateKey}')">
                    <div class="day-date">${dayName}, ${dateStr}</div>
                    <div class="day-events" id="events-${dateKey}">—</div>
                </div>
            `;
        }).join('');

        return `
            <div class="week-card">
                <div class="week-header">Неделя ${week.number}</div>
                <div class="week-days">
                    ${daysHTML}
                </div>
                <button class="add-event-btn" onclick="addWeeklyEvent(${week.number})">+ Добавить событие</button>
            </div>
        `;
    }).join('');

    calendar.innerHTML = weeksHTML;

    // Загрузка событий
    loadWeeklyEvents();
}

/**
 * Загрузка событий еженедельника
 */
function loadWeeklyEvents() {
    const events = JSON.parse(localStorage.getItem('pygmalion_weekly_events') || '{}');

    Object.keys(events).forEach(dateKey => {
        const eventsEl = document.getElementById(`events-${dateKey}`);
        if (eventsEl && events[dateKey].length > 0) {
            eventsEl.textContent = events[dateKey].join(', ');
        }
    });
}

/**
 * Открытие событий дня
 */
function openDayEvents(dateKey) {
    const events = JSON.parse(localStorage.getItem('pygmalion_weekly_events') || '{}');
    const dayEvents = events[dateKey] || [];

    const eventText = dayEvents.length > 0 ? dayEvents.join('\n') : 'Нет событий';
    const newEvent = prompt(`События на ${dateKey}:\n\n${eventText}\n\nДобавить новое событие:`);

    if (newEvent && newEvent.trim()) {
        if (!events[dateKey]) {
            events[dateKey] = [];
        }
        events[dateKey].push(newEvent.trim());
        localStorage.setItem('pygmalion_weekly_events', JSON.stringify(events));
        loadWeeklyEvents();
    }
}

/**
 * Добавление события в неделю
 */
function addWeeklyEvent(weekNumber) {
    showToast(`Выберите день в неделе ${weekNumber}`, 'info');
}

function init() {
    console.log('[init] Запуск ПИГМАЛИОН v0.3.21 «Протокол»...');

    // Миграция хранилища
    if (typeof Storage !== 'undefined') {
        Storage.migrateState();

        // Очистка просроченных Вр.У.З.
        Storage.cleanupExpiredTemporaries();

        // Начальные 5 У.М. в реестр (при первом входе)
        Storage.addInitialGiftTransactions();
    }

    loadState();

    // === Исправление О.К. в начальных транзакциях (v0.3.25) ===
    fixInitialGiftOK();

    updateOKBadge();
    updateCurrentDateTime();
    updateUEBalance();
    updateUMBalance();
    updateTriadButtons();
    updateUEIndicatorsFromState();
    calculateWeight();

    // === ro.DAG Refs — последние 3 транзакции ===
    renderRefs();

    // === ОБНОВЛЕНИЕ ОБЛИКА (при запуске) ===
    updateDomainsFromDAR();

    initEmission();
    initTransfer();
    initRegistries();
    initDevPanel();

    // Инициализация lastPhaseUpdate перед запуском метронома
    const now = getInternalTime();
    const phase = TimeRhythm ? TimeRhythm.getSystemPhase(now.getTime()) : getCurrentPhase();
    lastPhaseUpdate = phase;
    updatePhaseDisplay(phase, now.getHours(), now.getMinutes());

    // === v0.3.23: Инициализация новых модулей ===
    initValuationsToggle();
    renderValuationsList();
    renderValuationsDropdown();  // v0.3.24: Dropdown оценок
    initOrdersSVG();
    initDepartmentsGrid();
    updateStatuses();

    // === v0.3.24 Этап 2: Инициализация ===
    initUnionsCouncils();

    // === v0.3.25: Инициализация чатов ===
    initOrderChat();
    initDeptChat();

    // === v0.3.25: Инициализация кнопки музыки ===
    initMusicToggle();

    // === v0.3.26: Инициализация вкладок временного ключа ===
    initVKTabs();

    // === v0.3.26: Инициализация вкладок Акта 1 (Эмиссия/Ежедневник/Еженедельник) ===
    initAct1Tabs();

    startMetronome();

    console.log('[init] ПИГМАЛИОН запущен');
}

// === ЕДИНЫЙ ЦИКЛ ОБНОВЛЕНИЯ (МЕТРОНОМ) ===
let lastPhaseUpdate = null;

function startMetronome() {
    setInterval(() => {
        const now = getInternalTime();
        const nowMs = now.getTime();
        const phase = getCurrentPhase(); // v0.3.23: единый источник фаз
        const hour = now.getHours();
        const minutes = now.getMinutes();

        updateCurrentDateTime();
        updateBurnTimerDisplay();

        // === ОБНОВЛЕНИЕ ФАЗЫ (Действие/Сон/Тишина) ===
        updatePhaseDisplay(phase, hour, minutes);

        // === ШКАЛА ДУХОВНОСТИ: Обновление каждый тик ===
        calculateSpiritualDynamics();

        // === СБРОС ПОКАЗАТЕЛЕЙ В 04:00 (начало нового цикла) ===
        const today = now.toDateString();
        if (hour === 4 && minutes < 5 && AppState.lastResetDate !== today) {
            // Полный сброс всех ежедневных показателей
            AppState.todayGiven = 0;
            AppState.todayReceived = 0;
            AppState.todayBurned = 0;
            AppState.normUsedToday = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
            AppState.lastResetDate = today;
            AppState.lastNormReset = today;

            // === v0.3.26: Обновление счётчика бездействия ===
            updateInactivityCounter();

            console.log(`[04:00] Сброс всех показателей на ${today}`);

            // === АКТИВАЦИЯ IMPULSE → ACTIVE (КАНОН v0.3.23) ===
            activateImpulseUE();

            // Обновление UI после сброса
            updateUEStatusIndicator();
            updateUEIndicatorsFromState(); // КРИТИЧНО: обновление визуальных индикаторов А→Б
            calculateWeight();
            
            // === ШКАЛА ДУХОВНОСТИ: Обнуление в 04:00 ===
            // «Зеркало чисто» — новый день начался
            const fillEl = $('#spiritual-fill');
            const valueEl = $('#spiritual-value');
            if (fillEl && valueEl) {
                fillEl.classList.remove('negative', 'positive', 'neutral');
                fillEl.classList.add('neutral');
                fillEl.style.width = '0%';
                valueEl.classList.remove('negative', 'positive', 'neutral');
                valueEl.classList.add('neutral');
                valueEl.textContent = '0%';
                console.log('[Шкала] Зеркало чисто — новый день начат');
            }
        }

        // === СБРОС ТРИАД В 20:00 ===
        if (hour === 20 && minutes < 5 && AppState.lastTriadsReset !== today) {
            AppState.triadsUsed = {};
            AppState.lastTriadsReset = today;
            console.log('[20:00] Triads reset');
            updateTriadButtons();
        }

        // === ОЧИСТКА ЕЖЕДНЕВНИКА В 00:00 (v0.3.26) ===
        if (hour === 0 && minutes < 5 && AppState.lastDailyPlannerReset !== today) {
            clearDailyTasks();
            AppState.lastDailyPlannerReset = today;
        }

        // Управление состояниями У.Е. через TimeRhythm
        if (typeof TimeRhythm !== 'undefined') {
            let stateChanged = false;
            let totalBurned = 0;

            AppState.ueUnits.forEach(ue => {
                if (ue.status === 'transferred' || ue.status === 'burned') return;

                // === ИММУНИТЕТ ИМПУЛЬСА: impulse не сгорают ===
                if (ue.status === 'impulse') return;

                // === СГОРАНИЕ: только для active ===
                if (ue.status === 'active' && ue.burnAt <= nowMs) {
                    totalBurned += ue.amount;
                    ue.amount = 0;
                    ue.status = 'burned';
                    stateChanged = true;
                    return;
                }

                // === IMPULSE → ACTIVE: только по фазе системы, НЕ по createdAt ===
                // Это гарантирует переход ровно в 04:00 независимо от тестового времени
                // ПРИМЕЧАНИЕ: основная активация происходит в блоке 04:00 (строка 3376)
                // Этот блок — страховка на случай пропуска основной активации
                if (ue.status === 'impulse' && phase === 'active') {
                    console.log(`[Метроном-страховка] У.Е. №${ue.id}: impulse → active (фаза ${phase})`);
                    ue.status = 'active';
                    stateChanged = true;
                }

                // === ACTIVE → IMPULSE: если вошли в фазу сна (на случай смены фазы) ===
                // Не нужно — У.Е. не возвращаются в impulse после активации
            });

            if (totalBurned > 0) {
                AppState.burnedTotal += totalBurned;
                AppState.todayBurned += totalBurned;

                const burnedUEIds = AppState.ueUnits
                    .filter(ue => ue.status === 'burned')
                    .map(ue => ue.id);

                Storage.recordBurn({
                    amount: totalBurned,
                    ueIds: burnedUEIds,
                    txId: generateTxId()
                });

                // === ОЧИСТКА selectedUEForTransfer от сгоревших У.Е. (v0.3.21) ===
                const burnedSet = new Set(burnedUEIds);
                if (selectedUEForTransfer.some(id => burnedSet.has(id))) {
                    selectedUEForTransfer = selectedUEForTransfer.filter(id => !burnedSet.has(id));
                    updateTransferButton();
                    console.log(`[Сгорание] selectedUEForTransfer очищен от ${burnedUEIds.length} сгоревших У.Е.`);
                }

                updateDomainsFromDAR();
                calculateWeight();
            }

            if (stateChanged) {
                updateUEBalance();
                updateUEStatusIndicator();
                updateUEIndicatorsFromState();
                updateTriadButtons();
                saveState();
            }

            // Блокировка UI в Зоне Тишины
            if (phase === 'silence' && lastPhaseUpdate !== 'silence') {
                document.querySelectorAll('.transfer-btn, .emit-btn').forEach(btn => btn.disabled = true);
                lastPhaseUpdate = 'silence';
            } else if (phase !== 'silence' && lastPhaseUpdate === 'silence') {
                updateTriadButtons();
                lastPhaseUpdate = phase;
            }
            
            // Смена фазы
            if (phase !== lastPhaseUpdate) {
                updateTriadButtons();
                updateUEIndicatorsFromState();
                lastPhaseUpdate = phase;
            }
        }

    }, 1000);
}

// === ОЦЕНКИ ВХОДЯЩИХ У.М. (v0.3.23) ===

function renderValuationsList() {
    const container = document.getElementById('valuations-list');
    if (!container) return;

    const currentOK = getCurrentOK();
    const incomingTxs = AppState.transactions.filter(tx => {
        if (tx.type === 'received') return true;
        if (tx.to && tx.to.includes('::')) {
            return tx.to.replace(/::/g, '') === currentOK.replace(/::/g, '');
        }
        return false;
    }).filter(tx => tx.valuation && tx.valuation.trim());

    if (incomingTxs.length === 0) {
        container.innerHTML = '<p class="valuations-empty">Оценок пока нет</p>';
        return;
    }

    const sortedTxs = incomingTxs.slice().reverse();
    const rows = sortedTxs.map(tx => {
        const time = new Date(tx.timestamp);
        const hhmm = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const ddmmyy = time.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const ueNum = tx.ueNumber ? `№${tx.ueNumber}` : (tx.ueIds ? `№${tx.ueIds.join(',')}` : '№—');
        const fromShort = tx.from ? normalizeOK(tx.from).replace(/::/g, '') : '—';
        const valuation = tx.valuation || '';
        return `<div class="valuation-item">
            <span class="valuation-meta">${ddmmyy} ${hhmm} · от ::${fromShort}:: · ${ueNum}</span>
            <span class="valuation-text">«${valuation}»</span>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="valuations-list-inner">${rows}</div>`;
}

function initValuationsToggle() {
    const toggleBtn = document.getElementById('toggle-valuations');
    const listContainer = document.getElementById('valuations-list');
    if (toggleBtn && listContainer) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = listContainer.style.display !== 'none';
            listContainer.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) renderValuationsList();
        });
    }
}

// === ОРДЕНА (Меридианы) ::про.4,5.:: (v0.3.24) ===

function joinOrder(orderId) {
    const state = Storage.loadCrystalState();
    if (!state.membershipOrders) state.membershipOrders = [];

    // ::01:: — заявка предстоятелю (с подтверждением, v0.3.25)
    if (orderId === '01') {
        const currentOK = getCurrentOK();

        // Проверка: есть ли О.К.?
        if (!currentOK || currentOK === '::—::') {
            alert('⚠️ Для вступления в ОрДен ::01:: необходим О.К. — пройдите Порог');
            return;
        }

        const state = Storage.loadCrystalState();

        // Инициализация массива заявок
        if (!state.order01Applications) state.order01Applications = [];

        // Проверка: уже подавал заявку?
        const existingApp = state.order01Applications.find(app => app.from === currentOK);
        if (existingApp) {
            alert('Ваша заявка уже отправлена предстоятелю ::OP𝕯EH 𝕯AP::');
            return;
        }

        // Информационное уведомление (v0.3.26)
        const warningText = `📜 Орден ::01:: — Хранители

В ответ на вашу заявку может быть направлен Учётный Маркер (У.М.) от Ордена ::01:: (№1–№16).

При получении У.М. вы занимаете место в Ордене при условии, что выполняете требование или готовы выполнить его в течение 30 дней.

Если требование не выполнено — У.М. отзывается.

⚠️ Ограничения:
• Количество мест: ::32:: участника
• Пропуск ежедневных сессий и голосований ведёт к снижению репутации

Подать заявку?`;

        if (!confirm(warningText)) return;

        // Сохранение заявки
        state.order01Applications.push({
            from: currentOK,
            timestamp: Date.now(),
            status: 'pending'
        });
        Storage.saveCrystalState(state);

        alert('✦ Заявка отправлена предстоятелю ::OP𝕯EH 𝕯AP:: (орДен ::01::)');
        console.log(`[Ордена] Заявка в ::01:: от ${currentOK}`);
        return;
    }
    // ::09:: — не создан до v2.0.1
    if (orderId === '09') {
        showToast('Орден ::09:: не создан, ожидайте в версии 2.0.1', 'info');
        return;
    }

    // Проверка: уже участник? → ВЫХОД по повторному нажатию (v0.3.25)
    const existingIndex = state.membershipOrders.findIndex(m => m.orderId === `::${orderId}::`);
    if (existingIndex !== -1) {
        // Выход из орДена
        state.membershipOrders.splice(existingIndex, 1);
        Storage.saveCrystalState(state);

        // Обновляем AppState
        if (AppState.membership?.orders) delete AppState.membership.orders[orderId];
        AppState.membershipOrders = state.membershipOrders;

        renderOrderStatus(orderId);
        updateStatuses();
        showToast(`Вы вышли из ОрДена ::${orderId}::`, 'info');
        console.log(`[Ордена] Выход из ::${orderId}::`);
        return;
    }

    // ::02::-::08:: — вступление с подтверждением
    // === ЗАЩИТА: без О.К. нельзя вступить ===
    if (!guardRequireOK()) return;

    const orderNames = {
        '02': 'орДен «Воинов и защитников»',
        '03': 'орДен «Дерево ремёсел»',
        '04': 'орДен «Земледельцев»',
        '05': 'орДен «Воспитателей детей и попечителей сирот»',
        '06': 'орДен «Архитекторов, проектировщиков и строителей»',
        '07': 'орДен «Организаторы Индивидуального питания»',
        '08': 'орДен «Учёные, исследователи, изобретатели и Новаторы»'
    };
    const orderName = orderNames[orderId] || '';
    const confirmed = confirm(`Вы вступаете в ::${orderId}:: — ${orderName}\n\nДа - вступил\nНет - отмена`);

    if (!confirmed) {
        showToast('Вступление отменено', 'info');
        return;
    }

    state.membershipOrders.push({
        orderId: `::${orderId}::`,
        joinedAt: Date.now()
    });
    Storage.saveCrystalState(state);

    // Обновляем AppState для совместимости
    if (!AppState.membership) AppState.membership = { orders: {}, departments: {} };
    AppState.membership.orders[orderId] = true;
    AppState.membershipOrders = state.membershipOrders;

    renderOrderStatus(orderId);
    updateStatuses();
    showToast(`✓ Вы вступили в ::${orderId}:: — ${orderName}`, 'success');
    console.log(`[Ордена] Вступление в ::${orderId}::`);
}

function renderOrderStatus(orderId) {
    // Проверяем оба источника: membershipOrders (Storage) и membership.orders (AppState)
    const state = Storage.loadCrystalState();
    const isMember = state.membershipOrders?.some(m => m.orderId === `::${orderId}::`)
        || AppState.membership?.orders?.[orderId];

    // Внешний статус (v0.3.24)
    const statusEl = document.getElementById(`order-${orderId}-status`);
    if (statusEl) {
        statusEl.textContent = isMember ? '✓' : '○';
        statusEl.classList.toggle('is-active', !!isMember);
        statusEl.classList.toggle('active', !!isMember);
    }

    // Подсветка сектора (v0.3.25)
    const sectorGroup = document.querySelector(`.order-sector-group[data-order="${orderId}"]`);
    if (sectorGroup) {
        sectorGroup.classList.toggle('is-active', !!isMember);
    }
}

function renderAllOrderStatuses() {
    for (let i = 1; i <= 9; i++) {
        const id = String(i).padStart(2, '0');
        renderOrderStatus(id);
    }
}

function initOrdersSVG() {
    // Клик по секторам
    document.querySelectorAll('.order-sector-group').forEach(group => {
        group.addEventListener('click', () => {
            const orderId = group.dataset.order;
            joinOrder(orderId);
        });
    });

    // Клик по центру (::01::)
    const centerGroup = document.getElementById('order-01-group');
    if (centerGroup) {
        centerGroup.addEventListener('click', () => joinOrder('01'));
    }

    renderAllOrderStatuses();
}

// === ЧАТ ОРДЕНОВ (v0.3.25) ===

function initOrderChat() {
    const select = document.querySelector('#order-chat-tabs');
    if (!select) return;

    const tabs = select.querySelectorAll('.order-chat-tab:not(.disabled)');
    const messagesEl = document.getElementById('order-chat-messages');
    const inputRow = document.getElementById('order-chat-input-row');
    const input = document.getElementById('order-chat-input');
    const sendBtn = document.getElementById('order-chat-send');

    let currentOrder = null;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentOrder = tab.dataset.order;
            inputRow.style.display = 'flex';
            renderOrderChatMessages(currentOrder);
        });
    });

    if (sendBtn && input) {
        sendBtn.addEventListener('click', () => sendOrderChatMessage(currentOrder, input, messagesEl));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendOrderChatMessage(currentOrder, input, messagesEl);
        });
    }
}

function sendOrderChatMessage(orderId, input, messagesEl) {
    const text = input.value.trim();
    if (!text || !orderId) return;

    const msgs = loadOrderChats(orderId);
    msgs.push({
        from: getCurrentOK(),
        text: text,
        timestamp: Date.now()
    });
    saveOrderChats(orderId, msgs);
    input.value = '';
    renderOrderChatMessages(orderId);
}

function renderOrderChatMessages(orderId) {
    const el = document.getElementById('order-chat-messages');
    if (!el) return;

    const msgs = loadOrderChats(orderId);
    if (msgs.length === 0) {
        el.innerHTML = `<p class="order-chat-empty">${I18N.t('chat_no_messages')}</p>`;
        return;
    }

    el.innerHTML = msgs.map((m, idx) => {
        const time = new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `<div class="order-chat-msg" data-msg-index="${idx}">
            <span class="order-chat-msg-from">::${m.from}::</span>
            <span class="order-chat-msg-time">${time}</span>
            <span class="order-chat-msg-text">${escapeHtml(m.text)}</span>
            <button class="order-chat-reply-btn" data-reply-to="${m.from}" data-reply-time="${time}" title="Ответить">↩</button>
        </div>`;
    }).join('');

    // Добавляем обработчики для кнопок ответа
    el.querySelectorAll('.order-chat-reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const replyTo = btn.dataset.replyTo;
            const replyTime = btn.dataset.replyTime;
            const input = document.getElementById('order-chat-input');
            if (input) {
                input.value = `→ ::${replyTo}:: ${replyTime}: `;
                input.focus();
            }
        });
    });

    el.scrollTop = el.scrollHeight;
}

function loadOrderChats(orderId) {
    try {
        const data = localStorage.getItem(`pygmalion_order_chat_${orderId}`);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveOrderChats(orderId, msgs) {
    try {
        localStorage.setItem(`pygmalion_order_chat_${orderId}`, JSON.stringify(msgs));
    } catch (e) { console.error('[Order Chat] Error:', e); }
}

// === ЧАТ ОТДЕЛОВ (v0.3.25) ===

function initDeptChat() {
    // Инициализация тестовых сообщений для ::о0::
    initTestMessagesForDept0();

    const select = document.getElementById('dept-chat-select');
    if (!select) return;

    const messagesEl = document.getElementById('dept-chat-messages');
    const inputRow = document.getElementById('dept-chat-input-row');
    const input = document.getElementById('dept-chat-input');
    const sendBtn = document.getElementById('dept-chat-send');

    let currentDept = null;

    select.addEventListener('change', () => {
        currentDept = select.value;
        inputRow.style.display = 'flex';
        renderDeptChatMessages(currentDept);
    });

    if (sendBtn && input) {
        sendBtn.addEventListener('click', () => sendDeptChatMessage(currentDept, input, messagesEl));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendDeptChatMessage(currentDept, input, messagesEl);
        });
    }
}

function sendDeptChatMessage(deptId, input, messagesEl) {
    const text = input.value.trim();
    if (!text || !deptId) return;

    const msgs = loadDeptChats(deptId);
    msgs.push({
        from: getCurrentOK(),
        text: text,
        timestamp: Date.now()
    });
    saveDeptChats(deptId, msgs);
    input.value = '';
    renderDeptChatMessages(deptId);
}

function renderDeptChatMessages(deptId) {
    const el = document.getElementById('dept-chat-messages');
    if (!el) return;

    const msgs = loadDeptChats(deptId);
    if (msgs.length === 0) {
        el.innerHTML = `<p class="dept-chat-empty">${I18N.t('chat_no_messages')}</p>`;
        return;
    }

    el.innerHTML = msgs.map((m, idx) => {
        const time = new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return `<div class="dept-chat-msg" data-msg-index="${idx}">
            <span class="dept-chat-msg-from">::${m.from}::</span>
            <span class="dept-chat-msg-time">${time}</span>
            <span class="dept-chat-msg-text">${escapeHtml(m.text)}</span>
            <button class="dept-chat-reply-btn" data-reply-to="${m.from}" data-reply-time="${time}" title="Ответить">↩</button>
        </div>`;
    }).join('');

    // Добавляем обработчики для кнопок ответа
    el.querySelectorAll('.dept-chat-reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const replyTo = btn.dataset.replyTo;
            const replyTime = btn.dataset.replyTime;
            const input = document.getElementById('dept-chat-input');
            if (input) {
                input.value = `→ ::${replyTo}:: ${replyTime}: `;
                input.focus();
            }
        });
    });

    el.scrollTop = el.scrollHeight;
}

function loadDeptChats(deptId) {
    try {
        const data = localStorage.getItem(`pygmalion_dept_chat_${deptId}`);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveDeptChats(deptId, msgs) {
    try {
        localStorage.setItem(`pygmalion_dept_chat_${deptId}`, JSON.stringify(msgs));
    } catch (e) { console.error('[Dept Chat] Error:', e); }
}

/**
 * Инициализация тестовых сообщений для чата ::о0::
 * 12 вопросов о разработке от О.К. ::01:: - ::12::
 */
function initTestMessagesForDept0() {
    const existingMsgs = loadDeptChats('о0');
    if (existingMsgs.length > 0) return; // Уже есть сообщения

    const testMessages = [
        { from: '01', text: 'Когда будет готова интеграция с PostgreSQL для ro.DAG?', timestamp: Date.now() - 11 * 60000 },
        { from: '02', text: 'Как планируется реализовать синхронизацию localStorage с БД?', timestamp: Date.now() - 10 * 60000 },
        { from: '03', text: 'Нужна ли поддержка offline-режима для передачи У.Е.?', timestamp: Date.now() - 9 * 60000 },
        { from: '04', text: 'Какой формат хранения для Союзов и Советов в базе?', timestamp: Date.now() - 8 * 60000 },
        { from: '05', text: 'Будет ли API для внешних приложений?', timestamp: Date.now() - 7 * 60000 },
        { from: '06', text: 'Как обрабатываются коллизии имён при создании Союзов?', timestamp: Date.now() - 6 * 60000 },
        { from: '07', text: 'Планируется ли мобильная версия MVP?', timestamp: Date.now() - 5 * 60000 },
        { from: '08', text: 'Как реализовать уведомления о входящих У.М.?', timestamp: Date.now() - 4 * 60000 },
        { from: '09', text: 'Нужна ли поддержка экспорта данных в JSON/CSV?', timestamp: Date.now() - 3 * 60000 },
        { from: '10', text: 'Как будет работать ротация глав Отделов?', timestamp: Date.now() - 2 * 60000 },
        { from: '11', text: 'Планируется ли интеграция с Telegram для уведомлений?', timestamp: Date.now() - 1 * 60000 },
        { from: '12', text: 'Когда ожидается релиз версии v0.4.0?', timestamp: Date.now() }
    ];

    saveDeptChats('о0', testMessages);
    console.log('[Dept Chat] Инициализированы 12 тестовых сообщений для ::о0::');
}

// === УТИЛИТА: escape HTML ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === ОТДЕЛЫ (Широты) ::про.4,5.:: (v0.3.24) ===

/**
 * Получить название Отдела из i18n
 * @param {string} deptId - ID отдела (о0, о1, ..., о16)
 * @returns {string} - Название отдела
 */
function getDepartmentName(deptId) {
    const key = `dept_${deptId}`;
    const currentLang = localStorage.getItem('pygmalion_lang') || 'ru';

    // Попытка получить из i18n
    if (window.i18nData && window.i18nData[currentLang] && window.i18nData[currentLang][key]) {
        return window.i18nData[currentLang][key];
    }

    // Fallback на русские названия
    const deptNames = {
        'о0': 'ВРЕМЕННЫЙ (переходный)',
        'о1': 'НЕ НАСИЛИЯ (добровольности)',
        'о2': 'ПРАВДИВОСТИ',
        'о3': 'ВОЗДЕРЖАНИЯ',
        'о4': 'ОТКАЗА ОТ ВОРОВСТВА',
        'о5': 'НЕ КОПИТЬ НЕ НАКАПЛИВАТЬ (аскезы)',
        'о6': 'ЧИСТОТЫ (мыслей и пространства)',
        'о7': 'ДУХ ПРАКТИК',
        'о8': 'ПРЕДАННОСТЬ РОДУ И ДЕЛУ',
        'о9': 'ИЗУЧЕНИЯ ВЕД (живых знаний)',
        'о10': 'УДОВЛЕТВОРЁННОСТИ',
        'о11': 'ОСАНКИ, ОСНОВЫ',
        'о12': 'УПРАВЛЕНИЯ «ЖИВОЙ ЭНЕРГИЕЙ»',
        'о13': 'ОТВЛЕЧЁННОСТИ (восстановления сил)',
        'о14': 'КОНЦЕНТРАЦИИ (сплочённости)',
        'о15': 'МЕДИТАЦИИ',
        'о16': 'САМОРЕАЛИЗАЦИИ'
    };

    return deptNames[deptId] || '';
}

function joinDepartment(deptId) {
    const state = Storage.loadCrystalState();
    if (!state.membershipDepartments) state.membershipDepartments = [];

    // ::о0:: — только заявка
    if (deptId === 'о0') {
        // === ЗАЩИТА: без О.К. нельзя подать заявку ===
        if (!guardRequireOK()) return;
        showToast('Заявка в Отдел ::о0:: отправлена', 'info');
        return;
    }

    // Проверка: уже участник? → ВЫХОД по повторному нажатию (v0.3.25)
    const existingIndex = state.membershipDepartments.findIndex(m => m.deptId === `::${deptId}::`);
    if (existingIndex !== -1) {
        // Выход из отДела
        state.membershipDepartments.splice(existingIndex, 1);
        Storage.saveCrystalState(state);

        // Обновляем AppState
        if (AppState.membership?.departments) delete AppState.membership.departments[deptId];
        AppState.membershipDepartments = state.membershipDepartments;

        renderDepartmentStatus(deptId);
        updateStatuses();
        showToast(`Вы вышли из отДела ::${deptId}::`, 'info');
        console.log(`[Отделы] Выход из ::${deptId}::`);
        return;
    }

    // ::о1::-::о16:: — вступление с подтверждением и названием
    // === ЗАЩИТА: без О.К. нельзя вступить ===
    if (!guardRequireOK()) return;

    const deptName = getDepartmentName(deptId);
    const confirmed = confirm(`Вы вступаете в отДел ::${deptId}:: ${deptName}\n\nДа - вступил\nНет - отмена`);

    if (!confirmed) {
        showToast('Вступление отменено', 'info');
        return;
    }

    state.membershipDepartments.push({
        deptId: `::${deptId}::`,
        joinedAt: Date.now(),
        isHead: false
    });
    Storage.saveCrystalState(state);

    // Обновляем AppState для совместимости
    if (!AppState.membership) AppState.membership = { orders: {}, departments: {} };
    AppState.membership.departments[deptId] = true;
    AppState.membershipDepartments = state.membershipDepartments;

    renderDepartmentStatus(deptId);
    updateStatuses();
    showToast(`✓ Вы вступили в отДел ::${deptId}:: ${deptName}`, 'success');
    console.log(`[Отделы] Вступление в ::${deptId}::`);
}

function renderDepartmentStatus(deptId) {
    const state = Storage.loadCrystalState();
    const isMember = state.membershipDepartments?.some(m => m.deptId === `::${deptId}::`)
        || AppState.membership?.departments?.[deptId];

    // Определяем правильный ID элемента статуса
    let statusEl;
    if (deptId === 'о0') {
        statusEl = document.getElementById(`dept-${deptId}-status`);
        // Пробуем zero-версию
        if (!statusEl) statusEl = document.querySelector('.dept-status-zero');
    } else {
        statusEl = document.getElementById(`dept-${deptId}-status`);
    }

    if (statusEl) {
        statusEl.textContent = isMember ? '✓' : '○';
        statusEl.classList.toggle('is-active', !!isMember);
        statusEl.classList.toggle('active', !!isMember);
    }
}

function renderAllDepartmentStatuses() {
    const deptIds = ['о0','о1','о2','о3','о4','о5','о6','о7','о8','о9','о10','о11','о12','о13','о14','о15','о16'];
    deptIds.forEach(id => renderDepartmentStatus(id));
}

function initDepartmentsGrid() {
    document.querySelectorAll('.dept-btn:not(.dept-obscured)').forEach(btn => {
        btn.addEventListener('click', () => {
            const deptId = btn.dataset.dept;
            if (deptId) joinDepartment(deptId);
        });
    });

    renderAllDepartmentStatuses();
}

// === СТАТУСЫ УЧАСТНИКА ::про.4.ВЕС:: (v0.3.24) — ОБНОВЛЕНИЕ ===

function updateStatuses() {
    const state = Storage.loadCrystalState();
    if (!state.statuses) state.statuses = {
        current: 'participant',
        participantSince: state.lastEmissionTime || Date.now(),
        coParticipantSince: null,
        coWarriorSince: null,
        warriorSince: null,
        coInvestorSince: null,
        investorSince: null,
        buyoutAmount: 0
    };

    // Считаем из Storage (membershipOrders, membershipDepartments)
    const orderCount = (state.membershipOrders || []).length;
    const deptCount = (state.membershipDepartments || []).length;

    // Участник — только если есть О.К.
    const hasOK = localStorage.getItem('pygmalion_ok_key');
    state.statuses.participant = !!hasOK;
    if (!hasOK) {
        state.statuses.current = 'participant'; // Без О.К. — только placeholder
    }
    // Соучастник — ≥1 орДен И ≥2 отДела
    state.statuses.coParticipant = orderCount >= 1 && deptCount >= 2;
    // СоРатник — ≥2 ордена И ≥4 отДела
    state.statuses.coWarrior = orderCount >= 2 && deptCount >= 4;
    // Ратник — ≥4 орДена И ≥8 отДелов
    state.statuses.warrior = orderCount >= 4 && deptCount >= 8;
    // При несоответствии — статусы отменяются (явная проверка с downgrade)
    if (orderCount < 1 || deptCount < 2) {
        state.statuses.coParticipant = false;
    }
    if (orderCount < 2 || deptCount < 4) {
        state.statuses.coWarrior = false;
    }
    if (orderCount < 4 || deptCount < 8) {
        state.statuses.warrior = false;
        if (state.statuses.current === 'warrior') {
            state.statuses.current = 'coWarrior';
        }
    }

    // === Соинвестор/Инвестор: через выкуп У.М. от Отдела ::о0:: ===
    calculateInvestorStatuses(state);

    // Синхронизируем с AppState
    AppState.statuses = state.statuses;
    AppState.membershipOrders = state.membershipOrders;
    AppState.membershipDepartments = state.membershipDepartments;

    renderStatuses();
    Storage.saveCrystalState(state);
}

/**
 * Расчёт статусов Соинвестор/Инвестор через выкуп У.М. от ::о0::
 */
function calculateInvestorStatuses(state) {
    // Берём buyoutAmount из state.statuses
    const totalBuyout = state.statuses?.buyoutAmount || 0;

    // Соинвестор: 0 < buyoutAmount < 100 000
    state.statuses.coInvestor = totalBuyout > 0 && totalBuyout < 100000;

    // Инвестор: buyoutAmount >= 100 000
    state.statuses.investor = totalBuyout >= 100000;

    // Обновляем текущий статус
    if (state.statuses.investor) state.statuses.current = 'investor';
    else if (state.statuses.coInvestor) state.statuses.current = 'coInvestor';
    else if (state.statuses.warrior) state.statuses.current = 'warrior';
    else if (state.statuses.coWarrior) state.statuses.current = 'coWarrior';
    else if (state.statuses.coParticipant) state.statuses.current = 'coParticipant';
    else state.statuses.current = 'participant';

    console.log(`[Инвестор] Выкуп от ::о0:: ${totalBuyout} руб. Соинвестор: ${state.statuses.coInvestor}, Инвестор: ${state.statuses.investor}`);
}

function renderStatuses() {
    if (!AppState.statuses) return;
    document.querySelectorAll('.status-item').forEach(item => {
        const statusKey = item.dataset.status;
        const isActive = AppState.statuses[statusKey] === true;
        item.classList.toggle('is-active', isActive);
        const icon = item.querySelector('.status-icon');
        if (icon) icon.textContent = isActive ? '✓' : '○';
    });
}

// === СОЮЗЫ И СОВЕТЫ ::про.4,5.:: (v0.3.23) ===

/**
 * Проверка: занято ли название Союза (с инкрементом)
 * @param {string} name - базовое название
 * @returns {string} уникальное название (с +N если занято)
 */
function getUniqueUnionName(name) {
    const unions = AppState.unions || [];
    const existing = unions.map(u => u.name.toLowerCase());

    if (!existing.includes(name.toLowerCase())) {
        return name;
    }

    // Инкремент +1...+100
    for (let i = 1; i <= 100; i++) {
        const candidate = `${name} +${i}`;
        if (!existing.includes(candidate.toLowerCase())) {
            return candidate;
        }
    }

    // Если все 100 заняты — не должно произойти
    return `${name} +101`;
}

/**
 * Создать Профессиональный Союз
 * @param {string} name - название (до 100 симв., макс 6 слов)
 * @param {string} order - эгида Ордена (::02:: - ::08::)
 */
function createUnion(name, order) {
    // === ЗАЩИТА: без О.К. нельзя учредить Союз ===
    if (!guardRequireOK()) return;

    if (!name || !name.trim()) {
        showToast('Введите название Союза', 'error');
        return;
    }

    if (!order) {
        showToast('Выберите Орден (эгиду)', 'error');
        return;
    }

    // === ЛИМИТ: один участник — один Союз ===
    const myOK = getCurrentOK();
    const myUnions = (AppState.unions || []).filter(u => u.members.includes(myOK));
    if (myUnions.length >= 1) {
        showToast('У вас уже есть Союз. Один участник — один Союз', 'error');
        return;
    }

    const cleanName = name.trim().slice(0, 100);

    // Валидация пробелов: не более 5, не подряд
    const spaceCount = (cleanName.match(/ /g) || []).length;
    if (spaceCount > 5) {
        showToast('Максимум 5 пробелов в названии Союза', 'error');
        return;
    }
    if (/  /.test(cleanName)) {
        showToast('Два пробела подряд запрещены', 'error');
        return;
    }

    const words = cleanName.split(/\s+/).filter(Boolean);

    if (words.length > 6) {
        showToast('Название Союза: макс. 6 слов', 'error');
        return;
    }

    const uniqueName = getUniqueUnionName(cleanName);
    const isDuplicate = uniqueName !== cleanName;

    if (!AppState.unions) AppState.unions = [];

    const union = {
        id: 'union_' + Date.now().toString(36),
        name: uniqueName,
        order: order,
        createdAt: getInternalTime().getTime(),
        members: [getCurrentOK()]
    };

    AppState.unions.push(union);
    Storage.saveCrystalState(AppState);
    renderUnions();

    if (isDuplicate) {
        showToast(`Название занято. Создан: «${uniqueName}» под эгидой ::${order}::`, 'info');
    } else {
        showToast(`✦ Союз «${uniqueName}» учреждён под эгидой ::${order}::!`, 'success');
    }
    console.log(`[Союзы] Создан: ${uniqueName} (::${order}::)`);
}

/**
 * Редактировать название Союза
 * @param {string} unionId - ID Союза
 * @param {string} newName - новое название
 */
function editUnion(unionId, newName) {
    if (!AppState.unions) return;

    const idx = AppState.unions.findIndex(u => u.id === unionId);
    if (idx === -1) return;

    const cleanName = newName.trim().slice(0, 100);
    if (!cleanName) {
        showToast('Название не может быть пустым', 'error');
        return;
    }

    AppState.unions[idx].name = cleanName;
    Storage.saveCrystalState(AppState);
    renderUnions();
    showToast('Название Союза обновлено', 'success');
}

/**
 * Удалить Союз
 * @param {string} unionId - ID Союза
 */
function deleteUnion(unionId) {
    if (!AppState.unions) return;

    const idx = AppState.unions.findIndex(u => u.id === unionId);
    if (idx === -1) return;

    const unionName = AppState.unions[idx].name;
    AppState.unions.splice(idx, 1);
    Storage.saveCrystalState(AppState);
    renderUnions();
    showToast(`Союз «${unionName}» удалён`, 'success');
}

/**
 * Обновление индикатора статуса соЮзов и соВетов
 * 0 = ничего не создано
 * +1 = создан соЮз ИЛИ соВет
 * +2 = созданы И соЮз И соВет
 */
function updateUnionsCouncilsIndicator() {
    const indicator = document.getElementById('unions-councils-indicator');
    if (!indicator) return;

    const hasUnions = (AppState.unions || []).length > 0;
    const hasCouncils = (AppState.councils || []).length > 0;

    let status = 0;
    if (hasUnions && hasCouncils) {
        status = 2; // Оба созданы
    } else if (hasUnions || hasCouncils) {
        status = 1; // Один из них создан
    }

    indicator.textContent = status === 0 ? '0' : `+${status}`;
    indicator.setAttribute('data-status', status);
}

/**
 * Рендер списка Союзов
 */
function renderUnions() {
    const container = document.getElementById('unions-list');
    if (!container) return;

    const unions = AppState.unions || [];

    updateUnionsCouncilsIndicator(); // Обновляем индикатор

    if (unions.length === 0) {
        container.innerHTML = '<p class="unions-empty">Союзов пока нет</p>';
        return;
    }

    const currentOK = getCurrentOK();
    const rows = unions.map(union => {
        const date = new Date(union.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' });
        const isOwner = union.members.includes(currentOK);
        const orderBadge = union.order ? `<span class="union-order-badge">::${union.order}::</span>` : '';
        return `<div class="union-item" data-union-id="${union.id}">
            <span class="union-name">${union.name}</span>
            ${orderBadge}
            <span class="union-meta">${date} · ${union.members.length} уч.</span>
            ${isOwner ? `<button class="btn-edit-union" data-union-id="${union.id}" title="Редактировать">✏️</button>` : ''}
            ${isOwner ? `<button class="btn-delete-union" data-union-id="${union.id}" title="Удалить">✖</button>` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `<div class="unions-list-inner">${rows}</div>`;

    // Обработчики редактирования
    container.querySelectorAll('.btn-edit-union').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.unionId;
            const union = unions.find(u => u.id === id);
            if (!union) return;

            // Используем поле ввода вместо prompt
            const input = document.getElementById('union-name-input');
            if (input) {
                input.value = union.name;
                input.focus();
                input.select();

                // Временный обработчик для сохранения
                const saveHandler = () => {
                    if (input.value.trim()) {
                        editUnion(id, input.value.trim());
                        input.value = '';
                    }
                    input.removeEventListener('blur', saveHandler);
                };
                input.addEventListener('blur', saveHandler, { once: true });
            }
        });
    });

    // Обработчики удаления
    container.querySelectorAll('.btn-delete-union').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.unionId;
            const union = unions.find(u => u.id === id);
            if (!union) return;

            if (confirm(`Удалить соЮз «${union.name}»?`)) {
                deleteUnion(id);
            }
        });
    });
}

/**
 * Создать Территориальный Совет
 * @param {string} name - название
 * @param {string} department - Отдел (::о1:: – ::о16::)
 */
function createCouncil(name, department) {
    // === ЗАЩИТА: без О.К. нельзя учредить Совет ===
    if (!guardRequireOK()) return;

    if (!name || !name.trim()) {
        showToast('Введите название Совета', 'error');
        return;
    }
    if (!department) {
        showToast('Выберите Отдел', 'error');
        return;
    }

    // === ЛИМИТ: один участник — один Совет ===
    const myOK = getCurrentOK();
    const myCouncils = (AppState.councils || []).filter(c => c.members.includes(myOK));
    if (myCouncils.length >= 1) {
        showToast('У вас уже есть Совет. Один участник — один Совет', 'error');
        return;
    }

    const cleanName = name.trim().slice(0, 100);

    // Валидация пробелов: не более 5, не подряд
    const spaceCount = (cleanName.match(/ /g) || []).length;
    if (spaceCount > 5) {
        showToast('Максимум 5 пробелов в названии Совета', 'error');
        return;
    }
    if (/  /.test(cleanName)) {
        showToast('Два пробела подряд запрещены', 'error');
        return;
    }

    const words = cleanName.split(/\s+/).filter(Boolean);

    if (words.length > 6) {
        showToast('Название Совета: макс. 6 слов', 'error');
        return;
    }

    // Проверка коллизий с инкрементом
    const councils = AppState.councils || [];
    const existing = councils.filter(c => c.department === department).map(c => c.name.toLowerCase());
    let uniqueName = cleanName;

    if (existing.includes(cleanName.toLowerCase())) {
        for (let i = 1; i <= 100; i++) {
            const candidate = `${cleanName} +${i}`;
            if (!existing.includes(candidate.toLowerCase())) {
                uniqueName = candidate;
                break;
            }
        }
    }

    const isDuplicate = uniqueName !== cleanName;

    if (!AppState.councils) AppState.councils = [];

    const council = {
        id: 'council_' + Date.now().toString(36),
        name: uniqueName,
        department: department,
        createdAt: getInternalTime().getTime(),
        members: [getCurrentOK()]
    };

    AppState.councils.push(council);
    Storage.saveCrystalState(AppState);
    renderCouncils();

    if (isDuplicate) {
        showToast(`Название занято. Создан: «${uniqueName}» под эгидой ::${department}::`, 'info');
    } else {
        showToast(`✦ Совет «${uniqueName}» учреждён под эгидой ::${department}::!`, 'success');
    }
    console.log(`[Советы] Создан: ${uniqueName} (::${department}::)`);
}

/**
 * Редактировать название Совета
 * @param {string} councilId - ID Совета
 * @param {string} newName - новое название
 */
function editCouncil(councilId, newName) {
    if (!AppState.councils) return;

    const idx = AppState.councils.findIndex(c => c.id === councilId);
    if (idx === -1) return;

    const cleanName = newName.trim().slice(0, 100);
    if (!cleanName) {
        showToast('Название не может быть пустым', 'error');
        return;
    }

    AppState.councils[idx].name = cleanName;
    Storage.saveCrystalState(AppState);
    renderCouncils();
    showToast('Название Совета обновлено', 'success');
}

/**
 * Удалить Совет
 * @param {string} councilId - ID Совета
 */
function deleteCouncil(councilId) {
    if (!AppState.councils) return;

    const idx = AppState.councils.findIndex(c => c.id === councilId);
    if (idx === -1) return;

    const councilName = AppState.councils[idx].name;
    AppState.councils.splice(idx, 1);
    Storage.saveCrystalState(AppState);
    renderCouncils();
    showToast(`Совет «${councilName}» удалён`, 'success');
}

/**
 * Рендер списка Советов
 */
function renderCouncils() {
    const container = document.getElementById('councils-list');
    if (!container) return;

    const councils = AppState.councils || [];

    updateUnionsCouncilsIndicator(); // Обновляем индикатор

    if (councils.length === 0) {
        container.innerHTML = '<p class="councils-empty">Советов пока нет</p>';
        return;
    }

    const currentOK = getCurrentOK();
    const rows = councils.map(council => {
        const date = new Date(council.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' });
        const isOwner = council.members.includes(currentOK);
        return `<div class="council-item" data-council-id="${council.id}">
            <span class="council-name">${council.name}</span>
            <span class="council-dep">::${council.department}::</span>
            <span class="council-meta">${date} · ${council.members.length} уч.</span>
            ${isOwner ? `<button class="btn-edit-council" data-council-id="${council.id}" title="Редактировать">✏️</button>` : ''}
            ${isOwner ? `<button class="btn-delete-council" data-council-id="${council.id}" title="Удалить">✖</button>` : ''}
        </div>`;
    }).join('');

    container.innerHTML = `<div class="councils-list-inner">${rows}</div>`;

    // Обработчики редактирования
    container.querySelectorAll('.btn-edit-council').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.councilId;
            const council = councils.find(c => c.id === id);
            if (!council) return;

            // Используем поле ввода вместо prompt
            const input = document.getElementById('council-name-input');
            if (input) {
                input.value = council.name;
                input.focus();
                input.select();

                // Временный обработчик для сохранения
                const saveHandler = () => {
                    if (input.value.trim()) {
                        editCouncil(id, input.value.trim());
                        input.value = '';
                    }
                    input.removeEventListener('blur', saveHandler);
                };
                input.addEventListener('blur', saveHandler, { once: true });
            }
        });
    });

    // Обработчики удаления
    container.querySelectorAll('.btn-delete-council').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.councilId;
            const council = councils.find(c => c.id === id);
            if (!council) return;

            if (confirm(`Удалить соВет «${council.name}»?`)) {
                deleteCouncil(id);
            }
        });
    });
}

/**
 * Инициализация Союзов и Советов
 */
function initUnionsCouncils() {
    // Союз: кнопка «Учредить»
    const unionBtn = document.getElementById('btn-create-union');
    const unionInput = document.getElementById('union-name-input');
    const unionSelect = document.getElementById('union-order-select');
    if (unionBtn && unionInput && unionSelect) {
        // Валидация пробелов в реальном времени
        unionInput.addEventListener('input', (e) => {
            let value = e.target.value;
            // Запрет двух пробелов подряд
            value = value.replace(/  +/g, ' ');
            // Ограничение до 5 пробелов
            const spaces = (value.match(/ /g) || []).length;
            if (spaces > 5) {
                value = value.substring(0, value.lastIndexOf(' '));
            }
            e.target.value = value;
        });

        unionBtn.addEventListener('click', () => {
            createUnion(unionInput.value, unionSelect.value);
            unionInput.value = '';
            unionSelect.value = '';
        });
        // Enter для создания
        unionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createUnion(unionInput.value, unionSelect.value);
                unionInput.value = '';
                unionSelect.value = '';
            }
        });
    }

    // Совет: кнопка «Учредить»
    const councilBtn = document.getElementById('btn-create-council');
    const councilInput = document.getElementById('council-name-input');
    const councilSelect = document.getElementById('council-dept-select');
    if (councilBtn && councilInput && councilSelect) {
        // Валидация пробелов в реальном времени
        councilInput.addEventListener('input', (e) => {
            let value = e.target.value;
            // Запрет двух пробелов подряд
            value = value.replace(/  +/g, ' ');
            // Ограничение до 5 пробелов
            const spaces = (value.match(/ /g) || []).length;
            if (spaces > 5) {
                value = value.substring(0, value.lastIndexOf(' '));
            }
            e.target.value = value;
        });

        councilBtn.addEventListener('click', () => {
            createCouncil(councilInput.value, councilSelect.value);
            councilInput.value = '';
            councilSelect.value = '';
        });
        councilInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createCouncil(councilInput.value, councilSelect.value);
                councilInput.value = '';
                councilSelect.value = '';
            }
        });
    }

    // Первичный рендер
    renderUnions();
    renderCouncils();

    // === Inline ЧисСлоБукВ обработчики (v0.3.24) ===
    initInlineChislobukv('union-chislobukv', 'union-name-input');
    initInlineChislobukv('council-chislobukv', 'council-name-input');
}

/**
 * Инициализация inline ЧисСлоБукВ клавиатуры
 * @param {string} containerId - ID контейнера клавиатуры
 * @param {string} inputId - ID поля ввода
 */
function initInlineChislobukv(containerId, inputId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    container.querySelectorAll('.ch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const char = btn.dataset.char;

            if (action === 'delete') {
                // Удалить последний символ
                input.value = input.value.slice(0, -1);
            } else if (char) {
                // Проверка макс. длины
                if (input.value.length >= 100) return;
                input.value += char;
            }
            input.focus();
        });
    });
}

// Экспорт для отладки
window.PygmalionSandbox = {
    AppState,
    getInternalTime,
    getCurrentPhase,
    getUEBalance,
    saveState,
    loadState,
    TimeRhythm,
    Storage,
    getStorageStats: Storage.getStorageStats
};

// Запуск
document.addEventListener('DOMContentLoaded', init);
