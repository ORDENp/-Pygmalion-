// ============================================================
// Metronome — Единый источник времени для Пигмалион v0.4.0
// ============================================================
//
// Принцип: Темпоральный суверенитет
// Система не зависит от биологического ритма пользователя.
// Метроном бьёт с точностью цезиевых часов.
//
// Все вычисления времени проходят через эту точку.
// ============================================================

/**
 * Получить текущее внутреннее время системы
 * @returns {number} Unix timestamp (миллисекунды)
 */
let testClock = null; // только для тестов: tests/daily-cycle.test-clock.js
function getCurrentTime() {
  if (testClock !== null) return testClock;
  // В production синхронизируется с NTP; источник один и тот же для всех фаз
  return Date.now();
}

/**
 * TEST CLOCK — искусственное время для тестов переходов фаз.
 * Не бизнес-логика: в продакшене никогда не вызывается.
 * @param {number|null} ms — Unix timestamp или null (вернуть реальное время)
 */
function setTestClock(ms) { testClock = ms; }

/**
 * Получить текущее время в ISO формате
 * @returns {string} ISO timestamp
 */
function getCurrentTimeISO() {
  return new Date(getCurrentTime()).toISOString();
}

/**
 * Получить текущую фазу системы.
 *
 * Фаза — состояние единого потока времени (не условие интерфейса):
 *   impulse  20:00:00.000 – 03:59:59.999  формирование импульса У.Е.
 *   active   04:00:00.000 – 19:54:59.999  работа с активом
 *   silence  19:55:00.000 – 19:59:59.999  полный ::0::, переходная фаза
 *
 * Границы точные до миллисекунды; разрешённость действия всегда
 * вычисляется здесь, на серверном времени UTC (браузер время только
 * показывает и никогда не решает, какая фаза идёт).
 *
 * @returns {string} 'active' | 'silence' | 'impulse'
 */
function getCurrentPhase() {
  const now = getCurrentTime();
  const date = new Date(now);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = hours * 3600000 + minutes * 60000 + seconds * 1000 + date.getUTCMilliseconds();

  // ACTIVE 04:00:00.000 включительно → 19:54:59.999 включительно
  if (ms >= 4 * 3600000 && ms < 19 * 3600000 + 55 * 60000) {
    return 'active';
  }

  // SILENCE 19:55:00.000 включительно → 19:59:59.999 включительно (полный ::0::)
  if (ms >= 19 * 3600000 + 55 * 60000 && ms < 20 * 3600000) {
    return 'silence';
  }

  // IMPULSE 20:00:00.000 включительно → 03:59:59.999 включительно
  return 'impulse';
}

/**
 * SILENCE — фаза полного ::0::.
 * Состояние метронома, а не запрет отдельных действий:
 * в ней не выполняется ни действие предыдущей, ни действие следующей фазы.
 * @returns {boolean}
 */
function isSilence() {
  return getCurrentPhase() === 'silence';
}

/**
 * Ключ текущего дня по внутреннему времени Пространства.
 * Единственный способ узнать «наступил ли новый день» —
 * сравнить ключи дней, выданные метрономом.
 * Никакой другой компонент не вычисляет полночь самостоятельно.
 * @returns {string} 'YYYY-MM-DD'
 */
function getDayKey() {
  return new Date(getCurrentTime()).toISOString().slice(0, 10);
}

/**
 * Наступил ли новый день относительно последнего обработанного.
 * Cron спрашивает это после каждого wake-up — решение только здесь.
 * @param {string|null} lastProcessedKey — ключ последнего обработанного дня
 * @returns {boolean}
 */
function isNewDay(lastProcessedKey) {
  if (!lastProcessedKey) return true;
  return getDayKey() !== lastProcessedKey;
}

/**
 * Проверить, разрешена ли эмиссия в текущей фазе
 * @returns {boolean}
 */
function isEmissionAllowed() {
  const phase = getCurrentPhase();
  return phase !== 'silence';
}

/**
 * Проверить, разрешена ли передача в текущей фазе
 * @returns {boolean}
 */
function isTransferAllowed() {
  const phase = getCurrentPhase();
  return phase === 'active';
}

/**
 * Получить следующую полночь UTC
 * @param {number} [timestamp] - Unix timestamp (по умолчанию текущее время)
 * @returns {number} Unix timestamp следующей полуночи UTC
 */
function getNextMidnightUTC(timestamp) {
  const time = timestamp || getCurrentTime();
  const date = new Date(time);

  const nextMidnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  return nextMidnight.getTime();
}

/**
 * Вычислить burnAt для эмиссии
 * @param {number} [emissionTime] - Unix timestamp эмиссии (по умолчанию текущее время)
 * @returns {string} ISO timestamp burnAt
 */
function calculateBurnAt(emissionTime) {
  const time = emissionTime || getCurrentTime();
  const burnAtTimestamp = getNextMidnightUTC(time);
  return new Date(burnAtTimestamp).toISOString();
}

/**
 * Получить границу окна для проекций (window_start)
 * Канон: последняя полночь UTC
 * @returns {string} ISO timestamp для window_start
 */
function getWindowStart() {
  const now = getCurrentTime();
  const date = new Date(now);

  // Последняя полночь UTC (начало текущих суток)
  const lastMidnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));

  return lastMidnight.toISOString();
}

/**
 * Вычислить тишину (время с последнего акта)
 * @param {string} lastActTimestamp - ISO timestamp последнего акта
 * @returns {number} Часы тишины
 */
function calculateSilence(lastActTimestamp) {
  if (!lastActTimestamp) return Infinity;

  const now = getCurrentTime();
  const lastAct = new Date(lastActTimestamp).getTime();
  const diffMs = now - lastAct;

  return diffMs / (1000 * 60 * 60); // часы
}

// ============================================================
// Экспорт
// ============================================================

module.exports = {
  getCurrentTime,
  setTestClock,
  getCurrentTimeISO,
  getCurrentPhase,
  isSilence,
  getDayKey,
  isNewDay,
  isEmissionAllowed,
  isTransferAllowed,
  getNextMidnightUTC,
  calculateBurnAt,
  getWindowStart,
  calculateSilence
};
