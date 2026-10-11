/**
 * Тест единого источника времени v0.4.04.
 *
 * TEST CLOCK (metronome.setTestClock) — не бизнес-логика.
 * Проверяет:
 *  1) граничные секунды фаз;
 *  2) цепочку «cron wake-up → метроном → burn_at → решение»:
 *     cron не вычисляет полночь сам — он спрашивает Metronome.isNewDay,
 *     сгорание выполняется только по burn_at, выданному метрономом.
 */
const M = require('../backend/core/metronome');
const S = require('../backend/core/space-session');

let failures = 0;
function check(label, cond, extra = '') {
  console.log(` ${cond ? '✓' : '✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

// ---- 1. Границы фаз (точные до мс) ----
const cases = [
  ['03:59:59.999', Date.UTC(2026, 8, 25, 3, 59, 59, 999), 'impulse'],
  ['04:00:00.000', Date.UTC(2026, 8, 25, 4, 0, 0, 0), 'active'],
  ['19:54:59.999', Date.UTC(2026, 8, 25, 19, 54, 59, 999), 'active'],
  ['19:55:00.000', Date.UTC(2026, 8, 25, 19, 55, 0, 0), 'silence'],
  ['19:59:59.999', Date.UTC(2026, 8, 25, 19, 59, 59, 999), 'silence'],
  ['20:00:00.000', Date.UTC(2026, 8, 25, 20, 0, 0, 0), 'impulse']
];
for (const [label, ms, expect] of cases) {
  M.setTestClock(ms);
  check(`${label} → ${expect}`, M.getCurrentPhase() === expect, M.getCurrentPhase());
}

// ---- 2. Цепочка cron wake-up → метроном → burn_at ----
// (имитация обработчика из server.js: тот же порядок вопросов)
let lastBurnDay = null;
const cronWake = () => {
  S.tick();                                        // изолированное сгорание по burn_at
  if (!M.isNewDay(lastBurnDay)) return 'no-new-day';
  lastBurnDay = M.getDayKey();
  return 'burn-day';
};

// 10:00 ACTIVE: эмиссия, burn_at выдаёт метроном
M.setTestClock(Date.UTC(2026, 8, 25, 10, 0, 0));
S.planPass('::t::', ['T1']);
check('10:00: У.Е. в активе (3 шт.)', S.ueBalance('::t::').length === 3);
check('первый wake после старта инициализирует день', cronWake() === 'burn-day');

// wake в 23:59:59 — метроном: день не менялся → сгорания нет
M.setTestClock(Date.UTC(2026, 8, 25, 23, 59, 59, 999));
check('wake 23:59:59.999 → метроном: день не сменился', cronWake() === 'no-new-day');
check('  актив цел (сгорания нет)', S.ueBalance('::t::').length === 3);

// wake в 00:00:00.000 — метроном: новый день → сгорание по burn_at
M.setTestClock(Date.UTC(2026, 8, 26, 0, 0, 0, 0));
check('wake 00:00:00.000 → метроном: новый день', cronWake() === 'burn-day');
check('  сгорание по burn_at: актив 0', S.ueBalance('::t::').length === 0);
check('  шкала −3% (3 × −1)', S.scaleOf('::t::').percent === -3, `${S.scaleOf('::t::').percent}%`);
check('  К.О.Л. −3 ед.', S.kolOf('::t::').total === -3);

// повторный wake в тот же день — метроном: день уже обработан
check('wake 00:01 → повторного сгорания нет', cronWake() === 'no-new-day');
check('  шкала не изменилась', S.scaleOf('::t::').percent === -3);

// cron вообще не вычисляет полночь: ключи дней выдаёт только метроном
check('ключ дня принадлежит метроному', /^\d{4}-\d{2}-\d{2}$/.test(M.getDayKey()));

M.setTestClock(null);
console.log(failures === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (test clock, не бизнес-логика)' : `\nПРОВАЛЕНО: ${failures}`);
process.exit(failures ? 1 : 0);
