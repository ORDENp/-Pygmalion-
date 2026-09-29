# 🧪 REPLAY TEST — Сценарий проверки восстановимости

**Дата:** 2026-05-03  
**Версия:** v0.4.0-alpha  
**Статус:** Готов к выполнению

---

## 0. Контекст и философия

**Replay Test** — это проверка границы Event Sourcing:

> **Факт** (`acts_log`) достаточен для восстановления **проекции** (`ue_units`).

Это не тест функциональности. Это проверка архитектурного принципа:
- `acts_log` — единственный источник истины (SSOT)
- `ue_units` — производная проекция (derived state)
- Любое состояние системы может быть восстановлено из журнала актов

---

## 1. Предусловия

В системе должны быть:
- ✅ Таблицы: `acts_log`, `ue_units`
- ✅ Рабочий `/api/acts` (EMISSION, TRANSFER)
- ✅ Несколько актов в базе (минимум 2-3 EMISSION + 1-2 TRANSFER)

**Если данных нет** — сначала создайте акты через API:

```bash
# Пример: Эмиссия триады T1
curl -X POST http://localhost:3000/api/acts \
  -H "Content-Type: application/json" \
  -d '{
    "act_type": "EMISSION",
    "actor_ok": "::test123::",
    "payload": {
      "triads": ["T1"]
    }
  }'
```

---

## 2. Фиксация эталонного состояния (Snapshot)

### 2.1. Общее количество У.Е.

```sql
SELECT COUNT(*) as total_ue FROM ue_units;
```

**Запишите результат:** `___ У.Е.`

### 2.2. Баланс по О.К.

```sql
SELECT
  actor_ok,
  COUNT(*) as ue_count,
  STRING_AGG(DISTINCT status, ', ') as statuses
FROM ue_units
GROUP BY actor_ok
ORDER BY actor_ok;
```

**Запишите результат:**

| actor_ok | ue_count | statuses |
|----------|----------|----------|
| ... | ... | ... |

### 2.3. Детальный снимок (для одного О.К.)

```sql
-- Подставьте свой О.К.
\set ok '::test123::'

SELECT
  ue_number,
  triad,
  status,
  created_at,
  burn_at
FROM ue_units
WHERE actor_ok = :'ok'
ORDER BY created_at, ue_number;
```

**Сохраните результат** для сравнения после восстановления.

---

## 3. «Смерть» — Очистка проекции

### 3.1. TRUNCATE ue_units

```sql
BEGIN;
TRUNCATE ue_units CASCADE;
COMMIT;
```

### 3.2. Проверка очистки

```sql
SELECT COUNT(*) FROM ue_units;
-- Ожидаемо: 0
```

---

## 4. «Воскрешение» — Реконструкция из acts_log

### 4.1. Восстановление EMISSION

```sql
-- Шаг 1: Восстановить эмиссии для T1
INSERT INTO ue_units (ue_number, triad, actor_ok, status, created_at, burn_at, emission_act_id)
SELECT
  unnest(ARRAY[1,2,3]) AS ue_number,
  'T1' AS triad,
  actor_ok,
  CASE WHEN payload->>'phase' = 'impulse' THEN 'impulse' ELSE 'active' END AS status,
  created_at,
  (payload->>'burn_at')::timestamp AS burn_at,
  act_id AS emission_act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND payload->'triads' ? 'T1';

-- Повторить для T2, T3, T4, T5:
-- (замените 'T1' на 'T2', ARRAY[1,2,3] на ARRAY[4,5,6] и т.д.)

INSERT INTO ue_units (ue_number, triad, actor_ok, status, created_at, burn_at, emission_act_id)
SELECT
  unnest(ARRAY[4,5,6]) AS ue_number,
  'T2' AS triad,
  actor_ok,
  CASE WHEN payload->>'phase' = 'impulse' THEN 'impulse' ELSE 'active' END,
  created_at,
  (payload->>'burn_at')::timestamp,
  act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND payload->'triads' ? 'T2';

INSERT INTO ue_units (ue_number, triad, actor_ok, status, created_at, burn_at, emission_act_id)
SELECT
  unnest(ARRAY[7,8,9]) AS ue_number,
  'T3' AS triad,
  actor_ok,
  CASE WHEN payload->>'phase' = 'impulse' THEN 'impulse' ELSE 'active' END,
  created_at,
  (payload->>'burn_at')::timestamp,
  act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND payload->'triads' ? 'T3';

INSERT INTO ue_units (ue_number, triad, actor_ok, status, created_at, burn_at, emission_act_id)
SELECT
  unnest(ARRAY[10,11,12]) AS ue_number,
  'T4' AS triad,
  actor_ok,
  CASE WHEN payload->>'phase' = 'impulse' THEN 'impulse' ELSE 'active' END,
  created_at,
  (payload->>'burn_at')::timestamp,
  act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND payload->'triads' ? 'T4';

INSERT INTO ue_units (ue_number, triad, actor_ok, status, created_at, burn_at, emission_act_id)
SELECT
  21 AS ue_number,
  'T5' AS triad,
  actor_ok,
  CASE WHEN payload->>'phase' = 'impulse' THEN 'impulse' ELSE 'active' END,
  created_at,
  (payload->>'burn_at')::timestamp,
  act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND payload->'triads' ? 'T5';
```

### 4.2. Применение TRANSFER

```sql
-- Шаг 2: Применить передачи
UPDATE ue_units
SET
  status = 'transferred',
  actor_ok = t.target_ok,
  transferred_at = t.created_at,
  transfer_act_id = t.act_id
FROM acts_log t
WHERE t.act_type = 'TRANSFER'
  AND ue_units.ue_uuid = (t.payload->>'ue_uuid')::uuid;
```

### 4.3. Применение BURNED

```sql
-- Шаг 3: Применить сгорания
UPDATE ue_units
SET
  status = 'burned',
  transferred_at = b.created_at
FROM acts_log b
WHERE b.act_type = 'BURNED'
  AND ue_units.ue_uuid = (b.payload->>'ue_uuid')::uuid;
```

---

## 5. Верификация — Сравнение с эталоном

### 5.1. Общее количество У.Е.

```sql
SELECT COUNT(*) as total_ue FROM ue_units;
```

**Сравните с результатом из шага 2.1.**

### 5.2. Баланс по О.К.

```sql
SELECT
  actor_ok,
  COUNT(*) as ue_count,
  STRING_AGG(DISTINCT status, ', ') as statuses
FROM ue_units
GROUP BY actor_ok
ORDER BY actor_ok;
```

**Сравните с результатом из шага 2.2.**

### 5.3. Детальный снимок (для одного О.К.)

```sql
\set ok '::test123::'

SELECT
  ue_number,
  triad,
  status,
  created_at,
  burn_at
FROM ue_units
WHERE actor_ok = :'ok'
ORDER BY created_at, ue_number;
```

**Сравните с результатом из шага 2.3.**

### 5.4. Проверка через API

```bash
curl http://localhost:3000/api/mirror/::test123::
```

**Сравните:**
- `presence.ue_flow` — должен совпадать
- `trace.last_act_at` — должен совпадать
- `recognition` — не изменяется

---

## 6. Критерий успеха

Replay Test считается **пройденным**, если:

- ✅ `ue_units` полностью восстановлен (количество совпадает)
- ✅ Агрегаты по О.К. совпадают
- ✅ `/api/mirror` даёт тот же результат
- ✅ Порядок событий не нарушен
- ✅ Статусы У.Е. корректны

---

## 7. Интерпретация результатов

### ✅ Если тест ПРОХОДИТ

Это фиксирует:
> Система действительно event-sourced.  
> «Память» = только `acts_log`.  
> Проекции — вторичны и восстановимы.

**Вывод:** Фаза 1 «Фундамент» завершена. Архитектура подтверждена.

### ❌ Если тест НЕ ПРОХОДИТ

Это означает одно из:
- Логика есть вне `acts_log` (скрытое состояние)
- Часть данных хранится «в обход»
- `triads`/`amount` считаются недетерминированно
- Время влияет на результат (ошибка Метронома)

**Действие:** Найти источник расхождения и исправить.

---

## 8. Фиксация результата

После успешного прохождения теста:

1. Зафиксировать результат в `PROJECT-STATUS.md`:
   ```markdown
   ## ✅ Replay Test (2026-05-03)
   - Восстановлено: ___ У.Е.
   - Расхождений: 0
   - Статус: PASSED
   ```

2. Добавить сценарий в `MIGRATION-RULES.md` как обязательную проверку после изменений schema/server.js.

3. Запускать после любых изменений в:
   - `sql-schema/schema-v3.0-alpha.sql`
   - `backend/server.js` (логика EMISSION/TRANSFER)
   - `backend/core/metronome.js`

---

## 9. Философия теста

В рамках канона Пигмалион это можно сформулировать так:

- **`acts_log`** — это **световой след (Факт)**
- **`ue_units`** — это **временная проекция**
- **Replay** — это **восстановление узора из следа**

Это не продукт — это **проверка границы**.

---

**Дата создания:** 2026-05-03  
**Автор:** Claude Code (Kiro AI)  
**Статус:** Готов к выполнению
