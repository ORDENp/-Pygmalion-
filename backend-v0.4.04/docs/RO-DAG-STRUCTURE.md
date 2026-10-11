# ro.DAG — Анатомия светового следа

**Статус:** Реализовано (v0.4.0-alpha)  
**Дата:** 2026-05-02  
**Первый граф:** EMISSION → 6 × BURNED

---

## Суть

Трансформация плоского лога `acts_log` в **Reputation-Oriented Directed Acyclic Graph** через механизм ссылок (refs).

---

## Техническая реализация

### 1. Поле `refs` (UUID[])

Каждый новый акт в базе PostgreSQL теперь содержит массив ссылок на ID предыдущих узлов:

```sql
CREATE TABLE acts_log (
    act_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    act_type TEXT NOT NULL,
    actor_ok TEXT NOT NULL,
    target_ok TEXT,
    payload JSONB NOT NULL,
    
    -- Ссылки на родительские акты (ro.DAG)
    refs UUID[] DEFAULT '{}',
    
    merkle_hash TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Валидация: refs не может содержать сам себя
    CONSTRAINT no_self_reference CHECK (
        NOT (act_id = ANY(refs))
    )
);
```

### 2. Цепочка подтверждений

Акт `BURNED` (сгорание) явно ссылается на акт `EMISSION` (эмиссия), навсегда фиксируя в графе, что этот импульс не был передан:

```javascript
// Создание акта BURNED с refs на эмиссию
await client.query(
  `INSERT INTO acts_log (act_type, actor_ok, payload, refs)
   VALUES ($1, $2, $3, $4)`,
  [
    'BURNED',
    ue.actor_ok,
    {
      ue_uuid: ue.ue_uuid,
      ue_number: ue.ue_number,
      triad: ue.triad,
      burn_at: ue.burn_at
    },
    [ue.emission_act_id]  // refs на акт эмиссии
  ]
);
```

### 3. Валидация ацикличности

Внедрена проверка `no_self_reference`, предотвращающая петли в летописи действий:

```sql
CONSTRAINT no_self_reference CHECK (
    NOT (act_id = ANY(refs))
)
```

---

## Первый граф (2026-05-02T00:11:17.994Z)

```
EMISSION (45bc8189-9475-4552-a08c-dbf3a4c805cf)
    ↓ refs
    ├─ BURNED (b1b2b42a) — У.Е. №1, T1
    ├─ BURNED (e54ebe24) — У.Е. №2, T1
    ├─ BURNED (816904e6) — У.Е. №3, T1
    ├─ BURNED (27cb066f) — У.Е. №4, T2
    ├─ BURNED (2b3f5aad) — У.Е. №5, T2
    └─ BURNED (dd2ccaf9) — У.Е. №6, T2
```

Проверка в БД:

```sql
SELECT act_id, act_type, refs, created_at 
FROM acts_log 
WHERE act_type = 'BURNED' 
ORDER BY created_at;
```

Результат:
```
act_id                | act_type | refs                                   | created_at
----------------------+----------+----------------------------------------+----------------------------
b1b2b42a-...          | BURNED   | {45bc8189-9475-4552-a08c-dbf3a4c805cf} | 2026-05-02 00:11:17.583244
e54ebe24-...          | BURNED   | {45bc8189-9475-4552-a08c-dbf3a4c805cf} | 2026-05-02 00:11:17.583244
816904e6-...          | BURNED   | {45bc8189-9475-4552-a08c-dbf3a4c805cf} | 2026-05-02 00:11:17.583244
...
```

---

## Смысл

Репутация — это не число, а **плотность и чистота связей** в этом графе.

### Принципы ro.DAG:

1. **Append-only** — узлы никогда не удаляются
2. **Acyclic** — нет циклов, только направленные связи
3. **Reputation-Oriented** — граф отражает признание, а не накопление

### Типы связей:

- `EMISSION → TRANSFER` — передача У.Е.
- `EMISSION → BURNED` — сгорание (не передано)
- `TRANSFER → ANNOTATION` — признание (У.М.)

---

## Следующие шаги

- [ ] Функция `selectParentRefs()` для выбора 2-3 родительских узлов
- [ ] Визуализация графа для UI
- [ ] Traversal алгоритмы для расчёта репутационного веса
- [ ] Материализованные представления для производительности

---

## Файлы реализации

- `sql-schema/schema-v3.0-alpha.sql` — схема БД
- `server.js` — логика создания refs
