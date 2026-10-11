/**
 * Оболочка первых пяти протоколов (v0.5)
 *
 * Источник канона: backend-v0.4.02.GENEZIS/backend/core/canon/protocols.js
 * (::про.1:: – ::про.4,5:: — ПЛАН, ТОК, КОЛ, ВЕС, ББООСС)
 *
 * Этот модуль — пользовательская оболочка: для каждого протокола описан
 * экран в форме «Смысл → Выбор → Действие → Ответ».
 * Внутренняя архитектура наружу не выводится.
 */

const PROTOCOLS = {
  'про.1': {
    id: 'про.1',
    name: 'П.Л.А.Н.',
    full: '::про.1.П.Л.А.Н.::',
    essence: 'Осознанное начало. Человек намечает, на что направить свои У.Е. в текущем периоде.',
    screen: {
      sense: 'У.Е. сгорают в конце периода. План — это волевое решение, куда они пойдут.',
      choice: 'Выбрать направления (триады) и количество У.Е. — не больше ёмкости периода.',
      action: 'Подтвердить план: ::про.1.П.Л.А.Н.:: фиксируется как акт эмиссии.',
      answer: 'Система подтверждает акт и показывает план в поле: что задумано и до какого момента живёт.'
    },
    minStatus: 'participant',
    api: { POST: '/api/acts' }
  },
  'про.2': {
    id: 'про.2',
    name: 'Т.О.К.-О.Р.А.К.У.Л.-С.',
    full: '::про.2.Т.О.К.-О.Р.А.К.У.Л.-С.::',
    essence: 'Передача благодарности другому человеку по его О.К.',
    screen: {
      sense: 'Благодарность — движение У.Е. от человека к человеку, а не оценка.',
      choice: 'Указать О.К. получателя, количество У.Е. и слова, если хочется.',
      action: 'Подтвердить передачу — акт TRANSFER фиксируется в acts_log.',
      answer: 'Получатель видит благодарность в своём поле; отправитель видит отражение жеста.'
    },
    minStatus: 'participant',
    api: { POST: '/api/acts' }
  },
  'про.3': {
    id: 'про.3',
    name: 'К.О.Л.ЛИЦО-ОБЛИК',
    full: '::про.3.К.О.Л.ЛИЦО-ОБЛИК.::',
    essence: 'Отражение: репутационный образ человека в поле, без самооценки.',
    screen: {
      sense: 'Облик складывается из того, как другие передавали человеку благодарность.',
      choice: 'Открыть свой облик или облик по О.К. — смотреть, ничего не изменяя.',
      action: 'Запрос зеркала (::про.3::) — доступен любому, включая гостя.',
      answer: 'Система показывает живое зеркало: кто и как отразился в этом О.К.'
    },
    minStatus: 'any',
    api: { GET: '/api/mirror/:ok_id' }
  },
  'про.4': {
    id: 'про.4',
    name: 'В.Е.С.',
    full: '::про.4.В.Е.С.::',
    essence: 'Репутационный вес — вектор, а не скаляр: направление участия, не баллы.',
    screen: {
      sense: 'Вес показывает, где участие человека имеет силу, и ничего не «начисляет».',
      choice: 'Посмотреть свой вес по направлениям — без сравнения с другими.',
      action: 'Запрос веса (::про.4.В.Е.С.::) — только для участника с О.К.',
      answer: 'Система показывает векторы веса в поле, объясняя, откуда они выросли.'
    },
    minStatus: 'participant',
    api: { GET: '/api/field/:ok_id' }
  },
  'про.4,5': {
    id: 'про.4,5',
    name: 'Б.Б.О.О.С.С.',
    full: '::про.4,5.Б.Б.О.О.С.С.::',
    essence: 'Саморегулирование: Ордена, Отделы, Союзы, Советы — формы совместного решения.',
    screen: {
      sense: 'Сообщество само держит свои формы — без иерархии и назначения сверху.',
      choice: 'Войти в форму сообщества или увидеть решения, которые она принимает.',
      action: 'Действие внутри формы (::про.4,5.Б.Б.О.О.С.С.::) — требует членства.',
      answer: 'Система отражает решение и его след в общем поле.'
    },
    minStatus: 'member',
    api: {}
  }
};

const STATUSES = { GUEST: 'guest', PARTICIPANT: 'participant', MEMBER: 'member' };

const STATUS_RANK = { guest: 0, participant: 1, member: 2 };

function canAccess(protocolId, userStatus) {
  const p = PROTOCOLS[protocolId];
  if (!p) return { allowed: false, reason: 'unknown_protocol' };
  if (p.minStatus === 'any') return { allowed: true };
  const need = STATUS_RANK[p.minStatus];
  const have = STATUS_RANK[userStatus || STATUSES.GUEST];
  if (need === undefined || have === undefined) return { allowed: false, reason: 'unknown_status' };
  if (have >= need) return { allowed: true };
  return { allowed: false, reason: 'insufficient_status' };
}

function list(userStatus) {
  return Object.keys(PROTOCOLS).map(id => {
    const p = PROTOCOLS[id];
    const access = canAccess(id, userStatus);
    return {
      id: p.id,
      name: p.name,
      full: p.full,
      essence: p.essence,
      minStatus: p.minStatus,
      access: access.allowed,
      accessReason: access.allowed ? null : access.reason
    };
  });
}

function describe(protocolId, userStatus) {
  const p = PROTOCOLS[protocolId];
  if (!p) return null;
  return { ...p, screen: { ...p.screen }, access: canAccess(protocolId, userStatus) };
}

module.exports = { PROTOCOLS, STATUSES, canAccess, list, describe };
