/**
 * @file timeRhythm.js — Канон v1.1
 * Слой 1: Глобальный ритм системы (фазы)
 * Слой 2: Жизненный цикл У.Е. (сгорание)
 *
 * Канон сгорания:
 *   Все У.Е. сгорают в полночь, следующую за датой эмиссии (+1 день от даты создания).
 *   Эмиссия в 20:00-03:59 → burnAt = завтра 00:00 (= дата эмиссии +1 день)
 *   Эмиссия в 04:00-19:55 → burnAt = завтра 00:00 (= дата эмиссии +1 день)
 *   Итог: burnAt всегда = следующая полночь от даты эмиссии, без исключений.
 *
 *   Активация:
 *   Эмиссия 20:00-23:59 → impulse → active в 04:00 следующего дня
 *   Эмиссия 00:00-03:59 → impulse → active в 04:00 того же дня
 *   Эмиссия 04:00-19:55 → active мгновенно
 */

(function(global) {
  'use strict';

  const RHYTHM = {
    T0400: 4  * 3600000,
    T1955: 19 * 3600000 + 55 * 60000,
    T2000: 20 * 3600000
  };

  // === СЛОЙ 1: ФАЗА СИСТЕМЫ ===

  function getSystemPhase(nowMs) {
    const d = new Date(nowMs);
    const ms = d.getHours() * 3600000 + d.getMinutes() * 60000
             + d.getSeconds() * 1000    + d.getMilliseconds();

    if (ms >= RHYTHM.T0400 && ms < RHYTHM.T1955) return 'active';
    if (ms >= RHYTHM.T1955 && ms < RHYTHM.T2000) return 'silence';
    return 'impulse'; // 20:00:00.000 – 03:59:59.999
  }

  // === СЛОЙ 2: ТРИГГЕРЫ У.Е. ===
  // burnAt = следующая полночь после даты эмиссии (всегда +1 день)
  // Синхронизировано с calculateBurnAt() в logic.js

  function getUETriggers(emissionTime) {
    const em = new Date(emissionTime);
    const emMs = em.getHours() * 3600000 + em.getMinutes() * 60000
               + em.getSeconds() * 1000  + em.getMilliseconds();

    // Активация: когда У.Е. переходит из impulse → active
    let activation;
    if (emMs >= RHYTHM.T2000) {
      // 20:00-23:59 → активация ЗАВТРА в 04:00
      activation = new Date(em.getFullYear(), em.getMonth(), em.getDate() + 1, 4, 0, 0, 0);
    } else if (emMs < RHYTHM.T0400) {
      // 00:00-03:59 → активация СЕГОДНЯ в 04:00
      activation = new Date(em.getFullYear(), em.getMonth(), em.getDate(), 4, 0, 0, 0);
    } else {
      // 04:00-19:55 → активация мгновенная
      activation = new Date(em.getTime());
    }

    // Сгорание: ближайшая полночь (единый цикл)
    const burn = new Date(em.getFullYear(), em.getMonth(), em.getDate(), 0, 0, 0, 0);
    burn.setHours(24, 0, 0, 0); // ближайшая полночь

    return { activationTime: activation, burnTime: burn };
  }

  // === СЛОЙ 3: СОСТОЯНИЕ У.Е. ===
  // Используется ТОЛЬКО для детектирования сгорания.
  // Конвертация impulse → active в метрономе делается по фазе системы.

  function calculateUEState(ue, nowMs) {
    if (ue.status === 'burned')      return 'burned';
    if (ue.status === 'transferred') return 'transferred';

    const ms = typeof nowMs === 'number' ? nowMs : new Date(nowMs).getTime();
    const triggers = getUETriggers(ue.createdAt);

    if (ms >= triggers.burnTime.getTime())       return 'burned';
    if (ms <  triggers.activationTime.getTime()) return 'impulse';
    return 'active';
  }

  // === СЛОЙ 4: ВАЛИДАЦИЯ ПЕРЕДАЧИ ===

  function canTransfer(ue, nowMs) {
    const phase   = getSystemPhase(nowMs);
    const ueState = calculateUEState(ue, nowMs);
    return phase === 'active' && ueState === 'active';
  }

  global.TimeRhythm = { getSystemPhase, calculateUEState, canTransfer };

})(window);
