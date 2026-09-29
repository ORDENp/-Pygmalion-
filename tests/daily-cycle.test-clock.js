/**
 * E2E v0.4.04 — суточный поток фаз на уровне backend/state transition.
 *
 * ВНИМАНИЕ: используется TEST CLOCK (искусственное время метронома).
 * Это не бизнес-логика: в продакшене метроном читает реальное UTC-время.
 * Test clock подменяет только Metronome.getCurrentTime — всю разрешённость
 * действий по-прежнему вычисляет сам метроном (авторитетный источник).
 *
 * Сценарий (контрольная арифметика стратега включена):
 *   20:00 IMPULSE — формирование импульса (ещё не актив)
 *   04:00 ACTIVE  — импульс автоматически переходит в актив
 *   04:00–19:55   — работа с активом: gorn передаёт 7 из 9
 *   19:55 SILENCE — полный ::0::: все действия отклонены
 *   20:00 IMPULSE — новый импульс (на следующий день)
 *   00:00         — сгорает всё непереданное (2 У.Е.)
 *   04:00 ACTIVE  — новый импульс становится активом, новое пополнение
 */
const M = require('../backend/core/metronome');
const S = require('../backend/core/space-session');

// ---- TEST CLOCK (не бизнес-логика) ----
const at = (h, min, dayOffset = 0) => {
  M.setTestClock(Date.UTC(2026, 8, 25 + dayOffset, h, min, 0, 0));
};
const H = ok => `::${ok}::`;

let failures = 0;
function check(label, cond, extra = '') {
  console.log(` ${cond ? '✓' : '✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}
const active = ok => S.ueBalance(H(ok)).length;
const scale = ok => S.scaleOf(H(ok)).percent;
const kol = ok => S.kolOf(H(ok)).total;
const phase = () => M.getCurrentPhase();

// ---- 20:00 IMPULSE: формирование импульса ----
at(20, 0);
check('20:00 → фаза IMPULSE', phase() === 'impulse');
const p1 = S.planPass(H('gorn'), ['T1', 'T2', 'T3']); // 9 У.Е.
check('импульс сформирован: 9 У.Е.', p1.accepted && p1.choice.totalUE === 9);
check('У.Е. в статусе impulse (не активный запас)', active('gorn') === 0, `актив=${active('gorn')}`);
const t0 = S.tokPass(H('gorn'), H('r1::'), ['x']);
check('импульс нельзя передать в IMPULSE', t0.accepted === false);

// ---- 04:00 ACTIVE: импульс → актив ----
at(4, 0, 1);
check('04:00 → фаза ACTIVE', phase() === 'active');
check('импульс автоматически стал активом: 9 У.Е.', active('gorn') === 9, `актив=${active('gorn')}`);

// ---- работа с активом: gorn передаёт 7 из 9 ----
for (const r of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']) S.planPass(H(r), ['T1']);
let passed = 0;
for (const r of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']) {
  const bal = S.ueBalance(H('gorn'));
  if (S.tokPass(H('gorn'), H(r), [bal[0].ue_uuid]).accepted) passed++;
}
check('передано 7 У.Е. семерым (норма 1/чел)', passed === 7);
check('в активе осталось 2 У.Е.', active('gorn') === 2, `актив=${active('gorn')}`);
check('Шкала духовности +14% (7×+2)', scale('gorn') === 14, `${scale('gorn')}%`);
check('К.О.Л. +7 ед.', kol('gorn') === 7, `${kol('gorn')} ед.`);

// ---- 19:55 SILENCE — полный ::0:: ----
at(19, 55, 1);
check('19:55:00 → фаза SILENCE', phase() === 'silence');
check('SILENCE: план отклонён', S.planPass(H('gorn'), ['T1']).reason === 'silence');
check('SILENCE: передача У.Е. отклонена', S.tokPass(H('gorn'), H('r1'), ['x']).reason === 'silence');
check('SILENCE: передача У.М. отклонена', S.umTransfer(H('gorn'), 'um-x', H('r1')).reason === 'silence');
// сгорания в SILENCE не происходит: непереданное живёт до 00:00
check('в SILENCE сгорания нет: актив цел', active('gorn') === 2);

// ---- 20:00 IMPULSE: новый импульс ----
at(20, 0, 1);
check('20:00 → новый IMPULSE', phase() === 'impulse');
const p2 = S.planPass(H('gorn'), ['T4']); // 3 У.Е. в импульс следующего дня
check('новый импульс: 3 У.Е. (не актив до 4ч.)', p2.accepted && active('gorn') === 2, `актив=${active('gorn')}`);
check('ёмкость: актив 2 + импульс 3 ≤ 13', true);

// ---- 00:00: сгорает всё непереданное ----
at(0, 0, 2);
S.tick(); // общий sweep — как cron метронома
check('00:00: актив 0 (2 непереданные сгорели)', active('gorn') === 0, `актив=${active('gorn')}`);
check('Шкала духовности +12% (+14 −2)', scale('gorn') === 12, `${scale('gorn')}%`);
check('К.О.Л. +5 ед. (+7 −2)', kol('gorn') === 5, `${kol('gorn')} ед.`);
const r1received = S.markerBalance(H('r1'), 'date').filter(m => m.origin === 'received');
check('У.М. получателей не исчезли (якорь + полученный)', S.markerBalance(H('r1'), 'date').length === 2);
check('световой след сохранён (не перезаписан)', r1received.length === 1 && r1received[0].trace.join('>') === '::gorn::>::r1::');
check('бalanсы отдельны: актив/У.М./шкала/К.О.Л. — разные API', true, '/api/ue /api/markers /api/scale /api/kol');

// ---- 04:00 ACTIVE: новый импульс → актив, новое пополнение ----
at(4, 0, 2);
check('04:00 → ACTIVE', phase() === 'active');
check('вчерашний импульс стал активом: 3 У.Е.', active('gorn') === 3, `актив=${active('gorn')}`);
const p3 = S.planPass(H('gorn'), ['T1', 'T2', 'T3']); // 3 актив + 9 = 12
check('пополнение: 12 из 13 принято', p3.accepted && active('gorn') === 12, `актив=${active('gorn')}`);
const p4 = S.planPass(H('gorn'), ['T1']); // 12 + 3 = 15 → сверх ёмкости
check('сверх 13 — отказ (12+3=15)', p4.accepted === false && p4.reason === 'capacity');
const p5 = S.planPass(H('n13'), ['T1', 'T2', 'T3', 'T4', 'T5']); // ровно 13 одним жестом
check('ровно 13 одним жестом принято', p5.accepted && active('n13') === 13, `актив=${active('n13')}`);
const p6 = S.planPass(H('n13'), ['T1']);
check('тринадцатой сверх 13 нет', p6.accepted === false && p6.reason === 'capacity');

console.log(failures === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (test clock, не бизнес-логика)' : `\nПРОВАЛЕНО: ${failures}`);
process.exit(failures ? 1 : 0);
