# Шаг 11.1 — Социальная инфраструктура

**Дата:** 2026-05-07, 09:06 UTC  
**Статус:** Завершён  
**Фаза:** 3 «Визуализация поля и онтологическое расширение»

---

## Контекст

Шаг 11.1 реализует социальную инфраструктуру системы, заложенную в онтологии Абсолютного Нуля (Шаг 11.0).

Это не просто технические ограничения — это **архитектура служения**, где Предстоятель (::00::) и Орден ::01:: обеспечивают стабильность без узурпации власти.

---

## Выполненные задачи

### 1. Статус ro.DAG в Mirror API ✅

**Файл:** `backend/server.js` (endpoint `/api/mirror`)

#### Логика "двух галочек"

Статус ro.DAG показывает положение О.К. в Древе Инициаторов через две независимые проверки:

1. **received_um** — О.К. получил хотя бы одно У.М. от других участников
2. **sent_ue** — О.К. совершил хотя бы одну передачу У.Е.

**Реализация:**
```javascript
// 8. Статус ro.DAG (две галочки) — положение в Древе Инициаторов
const roDagStatusResult = await pool.query(
  `SELECT
    EXISTS(SELECT 1 FROM acts_annotations aa
      JOIN acts_log al ON aa.act_ref_id = al.act_id
      WHERE (al.actor_ok = $1 OR al.target_ok = $1)
        AND aa.annotation_type = 'RECOGNITION'
        AND aa.author_ok != $1
    ) AS received_um,
    EXISTS(SELECT 1 FROM acts_log
      WHERE actor_ok = $1 AND act_type = 'TRANSFER'
    ) AS sent_ue`,
  [ok_id]
);

const ro_dag_status = {
  received_um: roDagStatusResult.rows[0].received_um || false,
  sent_ue: roDagStatusResult.rows[0].sent_ue || false,
  in_tree: (roDagStatusResult.rows[0].received_um || false) && (roDagStatusResult.rows[0].sent_ue || false)
};
```

**Возвращаемая структура:**
```json
{
  "presence": {
    "ue_flow": { ... },
    "window_start": "2026-05-07T00:00:00.000Z",
    "ro_dag_status": {
      "received_um": true,
      "sent_ue": true,
      "in_tree": true
    }
  }
}
```

**Смысл:**
- `received_um: false, sent_ue: false` — новый О.К., ещё не вошёл в Древо
- `received_um: false, sent_ue: true` — О.К. передаёт, но ещё не признан
- `received_um: true, sent_ue: false` — О.К. признан, но сам не передаёт (редкий случай)
- `received_um: true, sent_ue: true` — О.К. полноценно участвует в Древе (`in_tree: true`)

---

### 2. Расширенные лимиты Предстоятеля (::00::) ✅

**Файлы:** `backend/server.js` (endpoints `/api/acts` и `/api/annotations`)

#### Лимиты У.Е. для Предстоятеля

**Обычный О.К.:** 6 У.Е. в день  
**Предстоятель (::00::):** 13 У.Е. в день

**Реализация в `/api/acts` (EMISSION):**
```javascript
// --- Проверка роли Предстоятеля (::00::) ---
const isPredstoyatel = actor_ok === '::00::';

// Расширенные лимиты для Предстоятеля (::00::)
const maxUEPerDay = isPredstoyatel ? 13 : 6;

// Проверка лимита на период
const window_start = Metronome.getWindowStart();
const emittedResult = await pool.query(
  `SELECT COALESCE(SUM((payload->>'total_ue')::int), 0) as emitted
   FROM acts_log
   WHERE actor_ok = $1 AND act_type = 'EMISSION'
     AND created_at >= $2::timestamp`,
  [actor_ok, window_start]
);

const emittedThisPeriod = parseInt(emittedResult.rows[0].emitted) || 0;
if (emittedThisPeriod + validation.totalUE > maxUEPerDay) {
  return res.status(400).json({
    error: `Превышен лимит ${maxUEPerDay} У.Е. на период. Уже эмитировано: ${emittedThisPeriod}`
  });
}
```

#### Лимиты У.М. для Предстоятеля

**Обычный О.К.:** 10 У.М. в день  
**Предстоятель (::00::):** 16 У.М. в день

**Реализация в `/api/annotations` (RECOGNITION):**
```javascript
const isPredstoyatel = author_ok === '::00::';
const maxUMPerDay = isPredstoyatel ? 16 : 10;

const umCountResult = await pool.query(
  `SELECT COUNT(*) as um_count
   FROM acts_annotations
   WHERE author_ok = $1 AND annotation_type = 'RECOGNITION'
     AND created_at >= $2::timestamp`,
  [author_ok, window_start]
);

const umThisPeriod = parseInt(umCountResult.rows[0].um_count) || 0;
if (umThisPeriod >= maxUMPerDay) {
  return res.status(400).json({
    error: `Превышен лимит ${maxUMPerDay} У.М. на период. Уже создано: ${umThisPeriod}`
  });
}
```

**Смысл:** Предстоятель имеет расширенные возможности для координации и признания, но остаётся в рамках канона (не безграничная власть).

---

### 3. Механизм преемственности (SUCCESSION) ✅

**Файл:** `backend/server.js` (endpoint `/api/acts`)

#### Тип акта SUCCESSION

Добавлен новый тип акта для передачи роли Предстоятеля:

```javascript
function isValidActType(type) {
  const validTypes = [
    'EMISSION', 'TRANSFER', 'BURNED', 'RECOGNITION',
    'TEMPORARY_CREATED', 'TEMPORARY_CONFIRMED', 'TEMPORARY_CANCELLED',
    'PHASE_CHANGE', 'TRIAD_RESET',
    'ORDER_JOIN', 'DEPARTMENT_JOIN', 'UNION_CREATED', 'COUNCIL_CREATED',
    'SUCCESSION'
  ];
  return validTypes.includes(type);
}
```

#### Логика SUCCESSION

**Условия:**
1. Только Предстоятель (::00::) может инициировать преемственность
2. Целевой О.К. должен существовать в системе (иметь хотя бы один акт)
3. Требуется указать причину передачи роли (payload.reason)

**Реализация:**
```javascript
// --- SUCCESSION: передача роли Предстоятеля (::00::) ---
else if (act_type === 'SUCCESSION') {
  // Только Предстоятель может инициировать преемственность
  if (actor_ok !== '::00::') {
    return res.status(403).json({ error: 'Только Предстоятель (::00::) может инициировать преемственность' });
  }

  if (!target_ok) {
    return res.status(400).json({ error: 'SUCCESSION requires target_ok (новый Предстоятель)' });
  }

  const { reason } = payload;

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ error: 'SUCCESSION requires reason (причина передачи роли)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем существование целевого О.К. (должен иметь хотя бы один акт)
    const targetCheck = await client.query(
      `SELECT COUNT(*) as act_count FROM acts_log WHERE actor_ok = $1`,
      [target_ok]
    );

    if (parseInt(targetCheck.rows[0].act_count) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Целевой О.К. не имеет актов в системе' });
    }

    // Выбираем родительские акты для ro.DAG
    const parentRefs = await selectParentRefs(actor_ok, 3);

    // Записываем акт SUCCESSION
    const successionPayload = {
      reason: reason.trim(),
      from: actor_ok,
      to: target_ok,
      timestamp: new Date().toISOString()
    };

    const actResult = await client.query(
      `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING act_id, created_at`,
      [act_type, actor_ok, target_ok, successionPayload, parentRefs]
    );

    const act_id = actResult.rows[0].act_id;
    const created_at = actResult.rows[0].created_at;

    await client.query('COMMIT');

    res.json({
      success: true,
      act_id: act_id,
      created_at: created_at,
      succession: {
        from: actor_ok,
        to: target_ok,
        reason: reason.trim()
      },
      note: 'Акт SUCCESSION зафиксирован. Смена учётной записи требует ручного вмешательства администратора БД.'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Важно:** Акт SUCCESSION фиксирует намерение передачи роли, но **не меняет автоматически учётную запись**. Это требует ручного вмешательства администратора БД для переноса истории актов и обновления идентификатора О.К.

**Смысл:** Преемственность — это не техническая операция, а **ритуал передачи ответственности**, зафиксированный в acts_log.

---

### 4. Системные ограничения управления ✅

**Файл:** `backend/server.js` (endpoint `/api/acts`)

#### Валидация управленческих актов

Добавлена проверка уникальности для управленческих актов:
- **ORDER_JOIN** — вступление в Орден
- **DEPARTMENT_JOIN** — вступление в Отдел
- **UNION_CREATED** — создание Союза
- **COUNCIL_CREATED** — создание Совета

**Реализация:**
```javascript
// --- Управленческие акты с валидацией уникальности ---
else if (['ORDER_JOIN', 'DEPARTMENT_JOIN', 'UNION_CREATED', 'COUNCIL_CREATED'].includes(act_type)) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем существование аналогичных ролей
    if (act_type === 'ORDER_JOIN') {
      const { order_id } = payload;
      if (!order_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'ORDER_JOIN requires order_id in payload' });
      }

      // Проверяем, не состоит ли О.К. уже в этом Ордене
      const existingMembership = await client.query(
        `SELECT act_id FROM acts_log
         WHERE act_type = 'ORDER_JOIN'
           AND actor_ok = $1
           AND payload->>'order_id' = $2`,
        [actor_ok, order_id]
      );

      if (existingMembership.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `О.К. ${actor_ok} уже состоит в Ордене ${order_id}` });
      }
    }

    // Аналогичные проверки для DEPARTMENT_JOIN, UNION_CREATED, COUNCIL_CREATED
    // ...

    // Выбираем родительские акты для ro.DAG
    const parentRefs = await selectParentRefs(actor_ok, 3);

    // Записываем управленческий акт
    const result = await client.query(
      `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING act_id, created_at`,
      [act_type, actor_ok, target_ok || null, payload, parentRefs]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      act_id: result.rows[0].act_id,
      created_at: result.rows[0].created_at
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Защита от дублирования:**
- О.К. не может вступить в один Орден дважды
- О.К. не может вступить в один Отдел дважды
- Союз с одинаковым ID не может быть создан дважды
- Совет с одинаковым ID не может быть создан дважды

**Смысл:** Система предотвращает создание дублирующих управленческих структур, сохраняя чистоту иерархии.

---

## Критерий успеха

✅ `/api/mirror` возвращает `ro_dag_status` с полями `received_um`, `sent_ue`, `in_tree`  
✅ Предстоятель (::00::) может эмитировать до 13 У.Е. в день (вместо 6)  
✅ Предстоятель (::00::) может создавать до 16 У.М. в день (вместо 10)  
✅ Только Предстоятель (::00::) может инициировать акт SUCCESSION  
✅ Акт SUCCESSION фиксируется в acts_log с причиной передачи роли  
✅ Управленческие акты (ORDER_JOIN, DEPARTMENT_JOIN, UNION_CREATED, COUNCIL_CREATED) проверяются на уникальность  
✅ Система предотвращает дублирование управленческих ролей

---

## Архитектурное значение

Шаг 11.1 материализует **архитектуру служения**, заложенную в онтологии Абсолютного Нуля.

**Предстоятель (::00::)** — это не диктатор, а **координатор**:
- Расширенные лимиты (13 У.Е. + 16 У.М.) позволяют ему активнее участвовать в жизни системы
- Механизм SUCCESSION обеспечивает прозрачную передачу роли
- Решающий голос ::33:: применяется только при патовых ситуациях (50/50)

**Статус ro.DAG** показывает положение О.К. в Древе Инициаторов:
- Это не рейтинг, а **геометрия доверия**
- Две галочки (received_um + sent_ue) показывают полноценное участие
- Визуализация в Canvas покажет форму, а не количество

**Системные ограничения** предотвращают хаос:
- О.К. не может вступить в один Орден дважды
- Союзы и Советы не могут дублироваться
- Это защищает чистоту иерархии без централизованной модерации

---

## Нереализованные элементы

**Механизм "части" (part):**
- У.М. от Предстоятеля с 30-дневным сроком действия
- Возврат "части" при невыполнении условий
- Требует расширения схемы `acts_annotations` (поле `expires_at`)

**Причина:** Механизм "части" требует более глубокой проработки:
- Как определить "невыполнение условий"?
- Кто инициирует возврат "части"?
- Как это влияет на ro.DAG?

**Решение:** Отложено до Фазы 4, когда появится практический опыт работы Ордена ::01::.

---

## Цитата

> «Власть — это не право командовать, а обязанность служить. Предстоятель — это не тот, кто решает за всех, а тот, кто держит равновесие, когда система колеблется».

---

## Следующие шаги

**Фаза 3 продолжается:**

1. **Визуализация статуса ro.DAG** — отображение "двух галочек" в Canvas
2. **Интеграция механизма голосования Ордена ::01::** — реализация решающего голоса ::33::
3. **Расширение протоколов** — детализация ::про.6:: — ::про.24::

---

## Статус

**Шаг 11.1 завершён.**

**Система обрела:**
- Статус ro.DAG (положение в Древе Инициаторов)
- Расширенные лимиты для Предстоятеля (13 У.Е. + 16 У.М.)
- Механизм преемственности (SUCCESSION)
- Системные ограничения управления (защита от дублирования)

**Социальная инфраструктура установлена. Архитектура служения материализована.**

---

**Pygmalion / C.R.I.S.T.A.L.L.**  
Числовая НОД-платформа  
Технология ТУТумУЕ / ТИУП(ч)  
© 2017–2026
