/**
 * Сессия пространства (v0.5) — пользовательский backend сценария.
 *
 * Граница: этот модуль готовит акты и держит состояние прохода человека.
 * Каноническая запись — /api/acts (acts_log, ue_units). GENEZIS не копируется.
 *
 * Канон правил v0.5 (решение владельца, 2026-09-25):
 *  1. Правило нормы У.Е. на передачу (::про.2::): одному О.К. в день —
 *     по 1 У.Е. из каждой триады (Т5 = единственная, достаётся первому).
 *     Пометить можно сколько угодно — всё сверх нормы АВТОМАТИЧЕСКИ
 *     возвращается в «актив» С УВЕДОМЛЕНИЕМ (в песочнице 0.3.26.05
 *     уведомления не было). На другой день норма обнуляется.
 *  2. Правило У.М.: «1 У.М. для 1 О.К. в день». Разным О.К. можно
 *     передавать сколько угодно (в пределах баланса), одному О.К. —
 *     максимум 1 У.М. в сутки. Баланс У.М. открывается, сортируется,
 *     для передачи выбирается конкретный маркер (световой след).
 *     Передача У.М. — новая операция, в песочнице её не было.
 *  3. Гость не получает передач (только наблюдает). r.i.p. передач
 *     не получает, но может наблюдать «с небес». «Своя ежедневная
 *     У.Е.» — только у полноценного участника.
 */

const Metronome = require('./metronome');
const ProtocolShell = require('./protocols');
const Scale = require('./spirit-scale');

const TRIADS = {
  T1: { name: 'Знания', ueCount: 3 },
  T2: { name: 'Практики', ueCount: 3 },
  T3: { name: 'Творчество', ueCount: 3 },
  T4: { name: 'Досуг/ЗОЖ', ueCount: 3 },
  T5: { name: '№21', ueCount: 1 }
};

const TRIAD_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5'];

const sessions = new Map(); // ok -> { passes, balance, markers }
const ripSet = new Set();   // r.i.p.: передачи невозможны, наблюдение возможно

function todayKey() {
  return new Date(Metronome.getCurrentTime()).toISOString().slice(0, 10);
}

function getSession(ok) {
  if (!sessions.has(ok)) {
    sessions.set(ok, {
      passes: [],
      balance: [],   // актив У.Е.: {ue_uuid, triad, status, owner, burn_at, created_at}
      markers: [],   // баланс У.М.: {um_id, status, owner, origin, trace[], created_at}
      normGiven: {}, // todayKey -> { targetOk -> Set<triad> } — что уже передано по норме
      umGiven: {}    // todayKey -> Set<targetOk> — кому уже передан У.М. сегодня
    });
    // 1 У.М. от Платформы — при создании У.З. (канон глоссария v0.5)
    sessions.get(ok).markers.push({
      um_id: `um-${ok}-platform`,
      status: 'active',
      owner: ok,
      origin: 'platform',
      trace: [ok],
      created_at: new Date(Metronome.getCurrentTime()).toISOString()
    });
  }
  return sessions.get(ok);
}

function isGuest(ok) {
  const s = sessions.get(ok);
  if (!s) return true;
  return !s.balance.some(u => u.status === 'active') &&
         !s.markers.some(m => m.status === 'active');
}

function validateTriads(triads) {
  if (!Array.isArray(triads) || triads.length === 0) {
    return { valid: false, error: 'Выберите хотя бы одно направление.' };
  }
  for (const t of triads) {
    if (!TRIADS[t]) return { valid: false, error: `Неизвестное направление: ${t}` };
  }
  const hasT5 = triads.includes('T5');
  const hasRegular = triads.some(t => ['T1', 'T2', 'T3', 'T4'].includes(t));
  if (hasT5 && !hasRegular) {
    return { valid: false, error: 'T5 (У.Е. №21) открывается после активации T1–T4.' };
  }
  const totalUE = triads.reduce((sum, t) => sum + TRIADS[t].ueCount, 0);
  if (totalUE > 13) {
    return { valid: false, error: 'Максимум 13 У.Е. на период.' };
  }
  return { valid: true, totalUE };
}

// --------------------------------------------------
// П.Л.А.Н. (::про.1::) — эмиссия: У.Е. попадают в «актив» человека
// --------------------------------------------------

function planPass(actorOk, triads) {
  const phase = Metronome.getCurrentPhase();

  // SILENCE — фаза полного ::0::: не выполняется ни действие предыдущей,
  // ни действие следующей фазы.
  if (phase === 'silence') {
    return {
      accepted: false,
      reason: 'silence',
      message: '::0:: Полный ::0:: (19:55–20:00). Переходная фаза: действия недоступны.'
    };
  }

  // IMPULSE — фаза формирования импульса: У.Е. создаются со статусом 'impulse'
  // и переходят в актив автоматически при наступлении ACTIVE (04:00).
  // ACTIVE — работа с активом, пополнение активного запаса до 13 максимум.
  const ueStatus = phase === 'impulse' ? 'impulse' : 'active';

  const validation = validateTriads(triads);
  if (!validation.valid) {
    return { accepted: false, reason: 'invalid_choice', message: validation.error };
  }

  const s = getSession(actorOk);
  // Ёмкость 13 У.Е. учитывает и актив, и уже сформированный импульс
  const held = s.balance.filter(u => u.status === 'active' || u.status === 'impulse').length;
  if (held + validation.totalUE > 13) {
    return { accepted: false, reason: 'capacity', message: `Максимум 13 У.Е. В активе/импульсе уже ${held}.` };
  }

  // Сгорание — полночь UTC, завершающая первый активный день этой У.Е.
  const burnAt = computeBurnAt().toISOString();
  const emitted = [];

  triads.forEach(t => {
    for (let i = 0; i < TRIADS[t].ueCount; i++) {
      const ue = {
        ue_uuid: `ue-${actorOk}-${t}-${Date.now()}-${i}`,
        triad: t,
        status: ueStatus,
        owner: actorOk,
        burn_at: burnAt,
        created_at: new Date(Metronome.getCurrentTime()).toISOString()
      };
      s.balance.push(ue);
      emitted.push(ue);
    }
  });

  s.passes.push({
    at: new Date().toISOString(), protocol: 'про.1',
    totalUE: validation.totalUE, triads, mode: 'isolated'
  });

  const impulseWord = ueStatus === 'impulse'
    ? 'Импульс сформирован — он перейдёт в ваш актив в 4ч., когда наступит активная фаза.'
    : 'У.Е. в вашем активе — до сгорания их можно передавать по правилу нормы.';

  return {
    accepted: true,
    protocol: 'про.1',
    mode: 'isolated',
    choice: {
      triads: triads.map(t => ({ id: t, name: TRIADS[t].name, ue: TRIADS[t].ueCount })),
      totalUE: validation.totalUE
    },
    act: {
      act_type: 'EMISSION',
      actor_ok: actorOk,
      payload: { protocol: '::про.1.П.Л.А.Н.::', triads, total_ue: validation.totalUE }
    },
    answer: {
      phase,
      burn_at: burnAt,
      text: `План принят: ${validation.totalUE} У.Е. (${ueStatus === 'impulse' ? 'импульс' : 'актив'}) — ` +
        triads.map(t => TRIADS[t].name).join(', ') + `. ${impulseWord}`
    },
    next_step: {
      protocol: 'про.2',
      text: ueStatus === 'impulse'
        ? 'Импульс пока не активный запас — передача откроется, когда он перейдёт в актив.'
        : 'Следующий естественный шаг — передать благодарность (::про.2.Т.О.К.::) или открыть отражение (::про.3.К.О.Л.::).'
    }
  };
}

// Сгорание: полночь UTC, завершающая активный день этой У.Е.
// Импульс, созданный вечером (20:00–23:59), входит в актив на следующее
// утро и сгорает в полночь после своего активного дня.
function computeBurnAt() {
  const now = Metronome.getCurrentTime();
  const nextMidnight = Metronome.getNextMidnightUTC(now);
  const d = new Date(now);
  const inEveningImpulse = Metronome.getCurrentPhase() === 'impulse' && d.getUTCHours() >= 20;
  return new Date(inEveningImpulse
    ? Metronome.getNextMidnightUTC(nextMidnight)
    : nextMidnight);
}

// --------------------------------------------------
// Правило нормы У.Е. (::про.2::): одному О.К. в день — 1 У.Е. из триады
// --------------------------------------------------

function applyNorm(s, actorOk, targetOk, markedUe) {
  const day = todayKey();
  if (!s.normGiven[day]) s.normGiven[day] = {};
  const givenToTarget = s.normGiven[day][targetOk] || new Set();

  const marked = markedUe
    .map(id => s.balance.find(u => u.ue_uuid === id))
    .filter(u => u && u.owner === actorOk && u.status === 'active');

  // порядок триад канонический; внутри триады — первый отмеченный
  const byTriad = {};
  marked.forEach(u => {
    (byTriad[u.triad] = byTriad[u.triad] || []).push(u);
  });

  const transferred = [];
  const returned = [];
  for (const t of TRIAD_ORDER) {
    const candidates = byTriad[t] || [];
    candidates.forEach((u, i) => {
      if (i === 0 && !givenToTarget.has(t)) {
        transferred.push(u);
        givenToTarget.add(t);
      } else {
        returned.push({ ue_uuid: u.ue_uuid, triad: t });
      }
    });
  }

  s.normGiven[day][targetOk] = givenToTarget;
  return { transferred, returned };
}

// --------------------------------------------------
// Т.О.К. (::про.2::) — передача благодарности по правилу нормы
// --------------------------------------------------

function tokPass(actorOk, targetOk, markedUe) {
  // SILENCE — полный ::0::: передача не выполняется
  if (Metronome.isSilence()) {
    return { accepted: false, reason: 'silence', message: '::0:: Полный ::0:: (19:55–20:00). Переходная фаза: передача не выполняется.' };
  }
  // Передача — работа с активом, происходит в ACTIVE (импульс ещё не активный запас)
  if (!Metronome.isTransferAllowed()) {
    return { accepted: false, reason: 'phase', message: 'Передача происходит в активной фазе (04:00–19:55). Импульс перейдёт в актив в 4ч.' };
  }
  const s = getSession(actorOk);

  if (!targetOk || !/^::[0-9A-Za-z._-]+::$/.test(targetOk)) {
    return { accepted: false, reason: 'invalid_target', message: 'Укажите О.К. того, кому передаёте благодарность.' };
  }
  if (targetOk === actorOk) {
    return { accepted: false, reason: 'self_transfer', message: 'Благодарность направлена другому человеку.' };
  }
  if (ripSet.has(targetOk)) {
    return { accepted: false, reason: 'rip', message: 'r.i.p. не получает передач. Он может наблюдать — с небес.' };
  }
  if (isGuest(targetOk)) {
    return { accepted: false, reason: 'guest', message: 'Гость не получает передач. У него появится своя ежедневная У.Е., когда он станет участником.' };
  }
  if (!Array.isArray(markedUe) || markedUe.length === 0) {
    return { accepted: false, reason: 'nothing_marked', message: 'Отметьте У.Е. из вашего актива.' };
  }

  const { transferred, returned } = applyNorm(s, actorOk, targetOk, markedUe);

  if (transferred.length === 0) {
    return {
      accepted: false,
      reason: 'norm_exhausted',
      message: 'Правило нормы: этому человеку сегодня уже передана У.Е. из каждой отмеченной триады. Норма обнулится завтра.'
    };
  }

  const burnAt = new Date(Metronome.calculateBurnAt()).toISOString();
  const target = getSession(targetOk);

  // Полученное признание ложится получателю на баланс У.М.
  // (::про.2.ТОК::: передача У.Е. -> У.М., канон глоссария v0.5).
  // Так баланс растёт от людей: N полученных признаний = N У.М.
  transferred.forEach(u => {
    u.status = 'transferred';
    target.markers.push({
      um_id: `um-${u.ue_uuid}`,
      status: 'active',
      owner: targetOk,
      origin: 'received',
      trace: [actorOk, targetOk],
      triad: u.triad,
      created_at: new Date().toISOString()
    });
    Scale.event(actorOk, 'UE_TRANSFERRED', { target_ok: targetOk, triad: u.triad });
    Scale.event(targetOk, 'UM_RECEIVED', { from: actorOk, um_id: `um-${u.ue_uuid}` });
  });

  const notice = returned.length > 0
    ? `Уведомление: ${returned.length} У.Е. вернулись в ваш актив — правило нормы передаёт одному человеку в день по 1 У.Е. из каждой триады. Норма обнулится завтра.`
    : null;

  s.passes.push({
    at: new Date().toISOString(), protocol: 'про.2',
    target_ok: targetOk,
    transferred: transferred.map(u => u.ue_uuid),
    returned: returned.map(u => u.ue_uuid),
    mode: 'isolated'
  });

  return {
    accepted: true,
    protocol: 'про.2',
    mode: 'isolated',
    choice: {
      target_ok: targetOk,
      marked: markedUe.length,
      transferred: transferred.map(u => ({ ue_uuid: u.ue_uuid, triad: u.triad })),
      returned
    },
    acts: transferred.map(u => ({
      act_type: 'TRANSFER',
      actor_ok: actorOk,
      target_ok: targetOk,
      payload: {
        protocol: '::про.2.Т.О.К.-О.Р.А.К.У.Л.-С.::',
        ue_uuid: u.ue_uuid
      }
    })),
    notice,
    answer: {
      text: `Передано ${transferred.length} У.Е. ` +
        `(${transferred.map(u => TRIADS[u.triad].name).join(', ')}) для ${targetOk}.` +
        (notice ? ` ${notice}` : '')
    },
    next_step: {
      protocol: 'про.3',
      text: 'Следующий естественный шаг — открыть отражение: своё или получателя (::про.3.К.О.Л.::).'
    }
  };
}

// --------------------------------------------------
// У.М.: баланс + правило «1 У.М. для 1 О.К. в день»
// --------------------------------------------------

function markerBalance(ok, sort, filter) {
  tick(ok);
  const s = getSession(ok);
  let list = s.markers.filter(m => m.owner === ok && m.status === 'active');
  if (filter === 'received') list = list.filter(m => m.origin === 'received');
  if (filter === 'platform') list = list.filter(m => m.origin === 'platform');
  if (sort === 'origin') list.sort((a, b) => a.origin.localeCompare(b.origin));
  else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // по дате, свежие сверху
  return list;
}

function umTransfer(actorOk, umId, targetOk) {
  // SILENCE — полный ::0::: передача У.М. не выполняется
  if (Metronome.isSilence()) {
    return { accepted: false, reason: 'silence', message: '::0:: Полный ::0:: (19:55–20:00). Переходная фаза: передача У.М. не выполняется.' };
  }
  const s = getSession(actorOk);

  if (!targetOk || !/^::[0-9A-Za-z._-]+::$/.test(targetOk)) {
    return { accepted: false, reason: 'invalid_target', message: 'Укажите О.К. получателя.' };
  }
  if (targetOk === actorOk) {
    return { accepted: false, reason: 'self_transfer', message: 'У.М. передаётся другому человеку.' };
  }
  if (ripSet.has(targetOk)) {
    return { accepted: false, reason: 'rip', message: 'r.i.p. не получает передач. Он может наблюдать — с небес.' };
  }
  if (isGuest(targetOk)) {
    return { accepted: false, reason: 'guest', message: 'Гость не получает передач.' };
  }

  const m = s.markers.find(x => x.um_id === umId && x.owner === actorOk);
  if (!m || m.status !== 'active') {
    return { accepted: false, reason: 'marker_unavailable', message: 'Этот У.М. недоступен для передачи.' };
  }

  const day = todayKey();
  if (!s.umGiven[day]) s.umGiven[day] = new Set();
  if (s.umGiven[day].has(targetOk)) {
    return { accepted: false, reason: 'um_norm', message: 'Правило: 1 У.М. для 1 О.К. в день. Этому человеку У.М. уже передан сегодня.' };
  }

  m.status = 'transferred';
  const target = getSession(targetOk);
  // след дополняется: А → Б → В (история не заменяется)
  const newTrace = [...m.trace, targetOk];
  target.markers.push({
    um_id: m.um_id,
    status: 'active',
    owner: targetOk,
    origin: m.origin === 'platform' ? 'received-platform' : 'received',
    trace: newTrace,
    created_at: new Date().toISOString()
  });
  s.umGiven[day].add(targetOk);

  Scale.event(actorOk, 'UM_TRANSFERRED', { target_ok: targetOk, um_id: m.um_id, trace: newTrace });
  Scale.event(targetOk, 'UM_RECEIVED', { from: actorOk, um_id: m.um_id });

  s.passes.push({
    at: new Date().toISOString(), protocol: 'про.2.УМ',
    target_ok: targetOk, um_id: umId, mode: 'isolated'
  });

  return {
    accepted: true,
    protocol: 'про.2',
    kind: 'У.М.',
    mode: 'isolated',
    choice: { um_id: umId, target_ok: targetOk },
    act: {
      act_type: 'TRANSFER',
      actor_ok: actorOk,
      target_ok: targetOk,
      payload: { protocol: '::про.2.Т.О.К.-О.Р.А.К.У.Л.-С.::', um_id: umId, kind: 'um_marker' }
    },
    answer: {
      text: `У.М. передан: ${umId} теперь у ${targetOk}. Его световой след: ${[...m.trace, targetOk].join(' → ')}.`
    },
    next_step: {
      protocol: 'про.3',
      text: 'Световой след этого маркера виден в отражении (::про.3.К.О.Л.::).'
    }
  };
}

function ueBalance(ok) {
  tick(ok);
  return getSession(ok).balance.filter(u => u.status === 'active');
}

// Сгорание: У.Е. с истёкшим burn_at покидают актив, шкала получает −1% за каждую.
// Вызывается лениво при обращении к активу и из cron метронома.
function tick(ok) {
  const now = Metronome.getCurrentTime();
  const phase = Metronome.getCurrentPhase();
  const step = (s, owner) => {
    // ACTIVE 04:00 — импульс автоматически переходит в актив
    if (phase === 'active') {
      s.balance.forEach(u => {
        if (u.status === 'impulse' && u.owner === owner) u.status = 'active';
      });
    }
    // 00:00 — сгорает всё непереданное
    s.balance.forEach(u => {
      if (u.status === 'active' && u.owner === owner && new Date(u.burn_at).getTime() <= now) {
        u.status = 'burned';
        Scale.event(owner, 'UE_BURNED', { ue_uuid: u.ue_uuid, triad: u.triad });
      }
    });
  };
  if (ok) step(getSession(ok), ok);
  else sessions.forEach((s, owner) => step(s, owner));
}

// Шкала духовности и К.О.Л. — только чтение состояния
function scaleOf(ok) { tick(ok); return Scale.get(ok); }
function kolOf(ok) { tick(ok); return Scale.kol(ok); }

function markRip(ok) { ripSet.add(ok); }

// --------------------------------------------------
// Реестр всех У.З. — выбор получателя: сортировка + поиск "::0…"
// --------------------------------------------------

function registry(search, sort) {
  let oks = [...sessions.keys()];
  if (search) {
    const q = search.toLowerCase();
    oks = oks.filter(ok => ok.toLowerCase().includes(q));
  }
  const lastActivity = ok => {
    const p = sessions.get(ok).passes;
    return p.length ? new Date(p[p.length - 1].at).getTime() : 0;
  };
  if (sort === 'ok') oks.sort();
  else oks.sort((a, b) => lastActivity(b) - lastActivity(a)); // по свежей активности

  return oks.map(ok => ({
    ok,
    status: ripSet.has(ok) ? 'rip' : (isGuest(ok) ? 'guest' : 'participant'),
    um_active: sessions.get(ok).markers.filter(m => m.status === 'active' && m.owner === ok).length
  }));
}

function history(actorOk) {
  return getSession(actorOk).passes;
}

module.exports = {
  planPass, tokPass, umTransfer, markerBalance, ueBalance, registry, history,
  scaleOf, kolOf, tick,
  validateTriads, TRIADS, isGuest, markRip
};
