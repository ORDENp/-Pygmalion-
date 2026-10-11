/**
 * Шкала духовности (v0.5)
 *
 * Линия отображения динамики активности человека во времени.
 * НЕ рейтинг, НЕ репутационный балл, НЕ денежная величина.
 * Слово «баллы» в рабочей модели не используется.
 *
 * Единица отображения — % изменения положения линии динамики:
 *   передана 1 У.Е.            → +2%
 *   получен 1 У.М.             → +1%
 *   сгорела 1 У.Е.             → −1%
 *   передан 1 У.М. (А → Б)     → +3%
 *
 * Отдельно от шкалы живёт К.О.Л. — количественное отражение событий
 * в единицах (ед.), см. kol().
 *
 * Итоговый UI шкалы НЕ фиксируется (проверка на фокус-группах):
 * сейчас только данные для отображения.
 */

const RULES = {
  UE_TRANSFERRED: { delta: +2, label: 'передана У.Е.' },
  UM_RECEIVED: { delta: +1, label: 'получен У.М.' },
  UE_BURNED: { delta: -1, label: 'сгорела У.Е.' },
  UM_TRANSFERRED: { delta: +3, label: 'передан У.М.' }
};

// К.О.Л. — количество отражённых событий: ед. / шт., НЕ проценты.
// Правило владельца: сгорание У.Е. — это −1% (шкала) И −1 ед. (К.О.Л.).
const KOL_EVENTS = ['UE_TRANSFERRED', 'UM_RECEIVED', 'UM_TRANSFERRED', 'UE_BURNED'];
const KOL_WEIGHT = { UE_BURNED: -1 };

const people = new Map(); // ok -> { percent, events: [{at, type, delta, detail}] }

function person(ok) {
  if (!people.has(ok)) people.set(ok, { percent: 0, events: [] });
  return people.get(ok);
}

function event(ok, type, detail) {
  const rule = RULES[type];
  if (!rule) return;
  const p = person(ok);
  p.percent += rule.delta;
  p.events.push({
    at: new Date().toISOString(),
    type,
    delta: rule.delta,
    label: rule.label,
    detail: detail || {}
  });
}

function get(ok) {
  const p = person(ok);
  const recent = p.events.slice(-8).reverse();
  return {
    percent: p.percent,
    unit: '% динамики',
    is_rating: false, // шкала — линия динамики, не рейтинг
    rules: Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, r.delta])),
    recent
  };
}

// К.О.Л. — количество отражённых событий: ед. / шт., НЕ проценты
function kol(ok) {
  const p = person(ok);
  const today = new Date().toISOString().slice(0, 10);
  const kolEvents = p.events.filter(e => KOL_EVENTS.includes(e.type));
  const todayEvents = kolEvents.filter(e => e.at.slice(0, 10) === today);

  const days = new Set(kolEvents.map(e => e.at.slice(0, 10))).size || 1;
  const weight = e => KOL_WEIGHT[e.type] || 1;
  return {
    today: todayEvents.reduce((n, e) => n + weight(e), 0),
    total: kolEvents.reduce((n, e) => n + weight(e), 0),
    per_day: +(kolEvents.reduce((n, e) => n + weight(e), 0) / days).toFixed(1),
    unit: 'ед.'
  };
}

module.exports = { event, get, kol, RULES };
