// ============================================================
// TimeRhythm — НЕ ПОДКЛЮЧЁН (v0.4.04).
//
// ЕДИНСТВЕННЫЙ авторитетный источник фазового времени — core/metronome.js
// (задание стратега: метроном определяет фазы, день и burn_at).
// Этот файл — исторический модуль окна восприятия; НЕ использовать
// для фазовых решений. При необходимости функции переводятся на метроном.
// ============================================================
//
// Принцип: У.Е. не "сгорают" физически.
// Они выходят за границу окна восприятия.
//
// acts_log остаётся неизменным.
// Меняется только window_start (граница проекции).
// ============================================================

/**
 * Получить текущее внутреннее время системы
 * @returns {number} Unix timestamp (миллисекунды)
 */
function getInternalTime() {
  return Date.now();
}

/**
 * Получить следующую полночь после указанного времени
 * @param {number} timestamp - Unix timestamp (миллисекунды)
 * @returns {number} Unix timestamp следующей полуночи (UTC)
 */
function getMidnight(timestamp) {
  const date = new Date(timestamp);

  // Следующая полночь (00:00:00 UTC)
  const nextMidnight = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  return nextMidnight.getTime();
}

/**
 * Получить границу окна для проекций (window_start)
 *
 * Канон: У.Е. учитываются от последней полуночи до текущего момента.
 * Всё что старше последней полуночи — за границей окна.
 *
 * @returns {string} ISO timestamp для window_start
 */
function getWindowStart() {
  const now = getInternalTime();
  const date = new Date(now);

  // Последняя полночь (начало текущих суток)
  const lastMidnight = new Date(date);
  lastMidnight.setHours(0, 0, 0, 0);

  return lastMidnight.toISOString();
}

/**
 * Вычислить burnAt для эмиссии
 *
 * Канон: burnAt = следующая полночь после эмиссии
 *
 * @param {number} emissionTime - Unix timestamp эмиссии
 * @returns {string} ISO timestamp burnAt
 */
function calculateBurnAt(emissionTime) {
  const burnAtTimestamp = getMidnight(emissionTime);
  return new Date(burnAtTimestamp).toISOString();
}

/**
 * Проверить, находится ли акт в текущем окне
 * @param {string} actTimestamp - ISO timestamp акта
 * @returns {boolean} true если акт в окне
 */
function isInWindow(actTimestamp) {
  const actTime = new Date(actTimestamp).getTime();
  const windowStartTime = new Date(getWindowStart()).getTime();

  return actTime >= windowStartTime;
}

/**
 * Вычислить тишину (время с последнего акта)
 * @param {string} lastActTimestamp - ISO timestamp последнего акта
 * @returns {number} Часы тишины
 */
function calculateSilence(lastActTimestamp) {
  if (!lastActTimestamp) return Infinity;

  const now = getInternalTime();
  const lastAct = new Date(lastActTimestamp).getTime();
  const diffMs = now - lastAct;

  return diffMs / (1000 * 60 * 60); // часы
}

/**
 * Получить текущую фазу системы
 * @param {number} timestamp - Unix timestamp (миллисекунды)
 * @returns {string} 'active' | 'silence' | 'impulse'
 */
function getCurrentPhase(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 04:00–19:55 → active
  if (totalMinutes >= 4 * 60 && totalMinutes < 19 * 60 + 55) {
    return 'active';
  }

  // 19:55–20:00 → silence
  if (totalMinutes >= 19 * 60 + 55 && totalMinutes < 20 * 60) {
    return 'silence';
  }

  // 20:00–03:59 → impulse
  return 'impulse';
}

// ============================================================
// Экспорт
// ============================================================

module.exports = {
  getInternalTime,
  getMidnight,
  getWindowStart,
  calculateBurnAt,
  isInWindow,
  calculateSilence,
  getCurrentPhase
};
