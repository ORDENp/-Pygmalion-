# ADR-01.2 — Каноническая версия

**Core Data Model & Event Flow**  
**Статус:** Accepted (Утверждено)  
**Дата:** 2026-05-03  
**Версия:** 3.0-alpha → 0.4.0

---

## 0. Контекст и философия

**Пигмалион / C.R.I.S.T.A.L.L.** — числовая НОД-платформа для наблюдения нематериального человеческого участия **без денег, принуждения и оценки**.

### Ключевые принципы:
- ❌ Нет торговли наёмного труда
- ❌ Нет "бесплатных баранок"
- ✅ Добровольность
- ✅ Числовое сдерживание
- ✅ Приоритет человеческого достоинства

Этап 3.0-alpha: переход от фронтенд-песочницы к серверной фиксации следов.

**Граница:**
- фронтенд — формирует акт
- backend — фиксирует факт
- база — хранит след

---

## 1. Принцип канона

### 1.1 У.Е. как событие
У.Е. — не объект хранения. У.Е. — событие (акт во времени).

### 1.2 Разделение слоёв

| Слой | Сущность | Свойство |
|------|----------|----------|
| Факт | acts_log | неизменяемый |
| Связь | ro_dag_edges | вычисляемый |
| Смысл | acts_annotations | изменяемый |
| Присутствие | ok_identity | подтверждаемый |

---

## 2. Минимальное ядро (4 таблицы)

### 2.1 ok_identity
```sql
ok_id TEXT PRIMARY KEY,
public_key TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### 2.2 acts_log (SSOT)
```sql
act_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
act_type TEXT NOT NULL,
actor_ok TEXT NOT NULL,
target_ok TEXT,
payload JSONB NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Immutability:** UPDATE и DELETE запрещены триггером.

### 2.3 ro_dag_edges
```sql
from_act_id UUID REFERENCES acts_log(act_id),
to_act_id UUID REFERENCES acts_log(act_id),
edge_type TEXT NOT NULL
```

### 2.4 acts_annotations
```sql
annotation_id UUID PRIMARY KEY,
act_ref_id UUID REFERENCES acts_log(act_id),
author_ok TEXT NOT NULL,
annotation_type TEXT NOT NULL,
value JSONB
```

---

## 2.5 ue_units — Производная проекция (derived state)

**Статус:** Материализованная проекция, НЕ источник истины.

### Назначение:
- Кэш для быстрого чтения активных У.Е.
- Упрощает запросы burn-процесса и проверку триад
- Избегает полного сканирования `acts_log` при каждом запросе

### Правила:
1. **Источник истины** — только `acts_log`
2. **Все изменения** идут через INSERT в `acts_log`
3. `ue_units` обновляется как следствие (application layer или триггер)
4. **В случае расхождения** `acts_log` имеет приоритет

### Восстановимость:
Таблица может быть полностью восстановлена из `acts_log`:

```sql
-- Восстановление ue_units из acts_log
INSERT INTO ue_units (
  ue_number, triad, actor_ok, status,
  created_at, burn_at, emission_act_id
)
SELECT 
  (payload->>'ue_id')::int AS ue_number,
  payload->>'triad' AS triad,
  actor_ok,
  CASE 
    WHEN payload->>'phase' = 'impulse' THEN 'impulse'
    ELSE 'active'
  END AS status,
  created_at,
  (payload->>'burn_at')::timestamp AS burn_at,
  act_id AS emission_act_id
FROM acts_log
WHERE act_type = 'EMISSION'
  AND NOT EXISTS (
    SELECT 1 FROM acts_log t
    WHERE t.act_type = 'TRANSFER'
      AND t.payload->>'ue_id' = acts_log.payload->>'ue_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM acts_log b
    WHERE b.act_type = 'BURNED'
      AND b.payload->>'ue_id' = acts_log.payload->>'ue_id'
  );
```

### Граница:
> `ue_units` существует для производительности, но не имеет права быть авторитетным источником данных.

---

## 3. Правила триад (T1-T5)

```
T1: Знания      → У.Е. №1, 2, 3    (3 шт.)
T2: Практики    → У.Е. №4, 5, 6    (3 шт.)
T3: Творчество  → У.Е. №7, 8, 9    (3 шт.)
T4: Досуг/ЗОЖ   → У.Е. №10, 11, 12 (3 шт.)
T5: №21         → У.Е. №21         (1 шт.)
```

**Правила эмиссии:**
- Минимум: 3 У.Е. (одна триада)
- Максимум: 13 У.Е. (все триады + №21)
- Лимит на период: 26 У.Е.
- У.Е. №21 доступна ТОЛЬКО после активации триады T1-T4

---

## 4. Метроном — Темпоральный суверенитет

### Фазы системы:
- 04:00–19:55 UTC → active
- 19:55–20:00 UTC → silence (эмиссия запрещена)
- 20:00–03:59 UTC → impulse (+4 часа иммунитета)

### Правило сгорания:
```
burnAt = следующая полночь UTC после эмиссии
```

**Backend НЕ использует NOW()** — время определяется через Метроном.

---

## 5. Карма и У.М.

- +2 кармы → передал У.Е. до полуночи
- +1 У.М. → получил благодарность
- 0 кармы → У.Е. сгорела

У.М.: начальный баланс 5, вес каждой = 1.

---

## 6. Gateway (роль backend)

Node.js ТОЛЬКО:
- ✅ проверка структуры
- ✅ вставка факта
- ✅ чтение проекций

❌ НЕ бизнес-логика, НЕ интерпретация.

---

## 7. Итог

Это граница:
- факт не меняется
- смысл не принуждается
- время не подменяется

