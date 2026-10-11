# SOCIAL-BREATHING — Операционный цикл

**Статус:** Accepted  
**Версия:** 1.0  
**Дата:** 2026-05-04

---

## Философия цикла

Система дышит: **вдох (эмиссия) → движение (передача) → признание (смысл) → выдох (сгорание)**.

Это не метафора — это **физика системы**.

---

## Цикл дыхания

```
EMISSION → потенциал
    ↓
TRANSFER → связь
    ↓
RECOGNITION → утолщение смысла
    ↓
BURN → освобождение
    ↓
(цикл повторяется)
```

---

## 1. EMISSION — потенциал (вдох)

### Что происходит

О.К. создаёт **6 У.Е.** (Учётных Единиц) через выбор триад.

**Триады:**
- T1 (Знание) → 3 У.Е. (#1, #2, #3)
- T2 (Практика) → 3 У.Е. (#4, #5, #6)
- T3 (Творчество) → 3 У.Е. (#7, #8, #9)
- T4 (Досуг/Здоровье) → 3 У.Е. (#10, #11, #12)
- T5 (#21) → 1 У.Е. (#21)

**Правила:**
- Выбор 2 триад из 5 (кроме T5)
- Или 1 триада + T5
- Всегда 6 У.Е. (3+3 или 3+1+1+1)

**Фазы эмиссии:**
- **active** (04:00-19:55 UTC) — обычная эмиссия
- **impulse** (20:00-03:59 UTC) — импульсная эмиссия (особый статус)

### Где фиксируется

**Таблица:** `acts_log`

**Акт:**
```json
{
  "act_type": "EMISSION",
  "actor_ok": "::ok.1::",
  "payload": {
    "triads": ["T1", "T2"],
    "burn_at": "2026-05-05T00:00:00Z",
    "phase": "active",
    "total_ue": 6
  },
  "refs": []
}
```

**Производная проекция:** `ue_units`
- Создаётся 6 записей (по одной на каждую У.Е.)
- `status = 'active'` или `'impulse'`
- `burn_at` = следующая полночь UTC (+1 день)

### Что отражает /api/mirror

```json
{
  "presence": {
    "ue_flow": 6,
    "window_start": "2026-05-04T00:00:00Z"
  }
}
```

---

## 2. TRANSFER — связь (движение)

### Что происходит

О.К. передаёт **1 У.Е.** другому О.К.

**Правила:**
- Можно передать только свою У.Е. (status = 'active' или 'impulse')
- Нельзя передать сгоревшую У.Е.
- Нельзя передать чужую У.Е.

**Эффект:**
- У.Е. меняет владельца (actor_ok)
- Статус меняется на 'transferred'
- Создаётся связь в ro.DAG (ребро FLOW)

### Где фиксируется

**Таблица:** `acts_log`

**Акт:**
```json
{
  "act_type": "TRANSFER",
  "actor_ok": "::ok.1::",
  "target_ok": "::ok.2::",
  "payload": {
    "ue_uuid": "...",
    "ue_number": 1,
    "triad": "T1",
    "reason": "за помощь"
  },
  "refs": [emission_act_id]
}
```

**Производная проекция:** `ue_units`
- `actor_ok` меняется на `target_ok`
- `status` меняется на `'transferred'`
- `transfer_act_id` сохраняет ссылку на акт передачи

**ro.DAG:** `ro_dag_edges`
- Создаётся ребро: `from_act_id` (EMISSION) → `to_act_id` (TRANSFER)
- `edge_type = 'FLOW'`

### Что отражает /api/mirror

```json
{
  "directions": {
    "given": {
      "count": 8,
      "direction": "outward"
    },
    "received": {
      "count": 5,
      "direction": "inward"
    }
  }
}
```

---

## 3. RECOGNITION — утолщение смысла (признание)

### Что происходит

О.К. создаёт **У.М.** (Учётный Маркер) — свидетельство признания акта.

**Правила:**
- Нельзя признавать себя (author_ok ≠ actor_ok)
- Уникальность: (act_ref_id, author_ok, marker_type)
- Не агрегируется в score/rating

**Типы признания:**
- `value` — признание ценности
- `gratitude` — благодарность
- `alignment` — совпадение по смыслу
- `witness` — свидетельство (я видел это)
- `support` — поддержка

**Глубина участия (witness_scope):**
- `personal` — личное участие (я был частью этого)
- `observation` — наблюдение (я видел это)
- `indirect` — косвенное свидетельство (я знаю об этом)

### Где фиксируется

**Таблица:** `acts_annotations`

**Аннотация:**
```json
{
  "annotation_type": "RECOGNITION",
  "act_ref_id": "transfer_act_id",
  "author_ok": "::ok.2::",
  "payload": {
    "marker_type": "gratitude",
    "marker_text": "Помог разобраться в сложной теме",
    "witness_scope": "observation",
    "triad_link": "T1"
  }
}
```

**Таблица:** `acts_log`

**Акт RECOGNITION:**
```json
{
  "act_type": "RECOGNITION",
  "actor_ok": "::ok.2::",
  "target_ok": "::ok.1::",
  "payload": {
    "marker_type": "gratitude",
    "marker_text": "Помог разобраться в сложной теме",
    "witness_scope": "observation",
    "triad_link": "T1",
    "act_ref_id": "transfer_act_id"
  },
  "refs": [transfer_act_id]
}
```

**ro.DAG:** `ro_dag_edges`
- Создаётся ребро: `from_act_id` (RECOGNITION) → `to_act_id` (признаваемый акт)
- `edge_type = 'RECOGNITION'`
- `meta = { witness_scope, triad_link, marker_type }`

### Что отражает /api/mirror

```json
{
  "recognition": {
    "recent_markers": [
      {
        "type": "gratitude",
        "text": "Помог разобраться в сложной теме",
        "witness_scope": "observation",
        "triad_link": "T1",
        "from": "::ok.2::",
        "at": "2026-05-04T14:00:00Z"
      }
    ]
  },
  "recognition_field": {
    "has_witnesses": true,
    "diversity": {
      "personal": false,
      "observation": true,
      "indirect": false
    },
    "triad_coverage": ["T1"],
    "multi_source": false,
    "cross_triad": false
  },
  "graph": {
    "recognition_links": 1,
    "unique_witnesses": 1,
    "density_hint": "sparse"
  }
}
```

---

## 4. BURN — освобождение (выдох)

### Что происходит

В **00:00 UTC** (полночь) Метроном автоматически сжигает все У.Е., у которых `burn_at <= NOW()`.

**Правила:**
- Сгорают все У.Е. (status = 'active', 'impulse', 'transferred')
- Сгорание необратимо
- Создаётся акт BURNED с refs на акт эмиссии

**Эффект:**
- У.Е. исчезает из активного потока
- Освобождается пространство для нового вдоха
- Система "выдыхает"

### Где фиксируется

**Таблица:** `acts_log`

**Акт:**
```json
{
  "act_type": "BURNED",
  "actor_ok": "::ok.1::",
  "payload": {
    "ue_uuid": "...",
    "ue_number": 1,
    "triad": "T1",
    "burn_at": "2026-05-04T00:00:00Z"
  },
  "refs": [emission_act_id]
}
```

**Производная проекция:** `ue_units`
- `status` меняется на `'burned'`
- `transferred_at` фиксирует момент сгорания

**ro.DAG:** `ro_dag_edges`
- Создаётся ребро: `from_act_id` (BURNED) → `to_act_id` (EMISSION)
- `edge_type = 'CAUSAL'`

### Что отражает /api/mirror

```json
{
  "burn": {
    "last_burn_at": "2026-05-04T00:00:00Z",
    "burned_recently": 6
  },
  "directions": {
    "burned": {
      "count": 6,
      "direction": "release"
    }
  }
}
```

### Автоматизация (Метроном)

**Файл:** `backend/core/metronome.js`

**Cron:** `'0 0 * * *'` (строго UTC)

**Логика:**
1. Найти все У.Е. с `burn_at <= NOW()`
2. Для каждой У.Е.:
   - Создать акт BURNED в acts_log
   - Обновить status в ue_units
3. Логировать результат (structured JSON)

**Логи:**
```json
{
  "event": "metronome_start",
  "timestamp": "2026-05-04T00:00:00Z",
  "phase": "silence",
  "level": "info"
}
{
  "event": "metronome_success",
  "timestamp": "2026-05-04T00:00:01Z",
  "candidates": 42,
  "burned": 42,
  "duration_ms": 1234,
  "level": "info",
  "details": [...]
}
```

---

## Связь с ro.DAG

Каждый этап цикла создаёт **рёбра в графе**:

```
EMISSION (act_id: A)
    ↓ (refs: [A])
TRANSFER (act_id: B) → ребро FLOW (A → B)
    ↓ (refs: [B])
RECOGNITION (act_id: C) → ребро RECOGNITION (C → B)
    ↓ (refs: [A])
BURNED (act_id: D) → ребро CAUSAL (D → A)
```

**Результат:** ro.DAG утолщается, но не превращается в метрику.

---

## Связь с зеркалом присутствия

`/api/mirror/:ok_id` отражает **текущее состояние цикла**:

```json
{
  "presence": { ... },      // EMISSION (вдох)
  "directions": {
    "given": { ... },       // TRANSFER (движение наружу)
    "received": { ... },    // TRANSFER (движение внутрь)
    "burned": { ... }       // BURN (выдох)
  },
  "recognition": { ... },   // RECOGNITION (смысл)
  "field": {
    "connections": "woven", // Состояние связности
    "activity": "active"    // Состояние активности
  }
}
```

---

## Временные границы (TimeRhythm)

### Канон времени 24+4

**Сутки = 24 часа (UTC) + 4 часа (ночь очищения)**

**Фазы:**
- **active** (04:00-19:55 UTC) — обычная активность
- **silence** (19:55-20:00 UTC) — тишина перед импульсом
- **impulse** (20:00-03:59 UTC) — импульсная фаза
- **purification** (00:00-00:01 UTC) — ночь очищения (burn)

**Правила:**
- `burn_at` всегда = следующая полночь UTC (+1 день)
- Метроном запускается строго в 00:00 UTC
- Фазы не пересекаются

**Документ:** `docs/METRONOME-CANON.md`

---

## Граница канона

### Что НЕ является частью цикла

- ❌ Начисление кармы/баллов
- ❌ Рейтинг участников
- ❌ Агрегация У.М. в score
- ❌ Сравнение О.К. между собой
- ❌ Метрики графа (degree, centrality)

### Что ЕСТЬ часть цикла

- ✅ Эмиссия → потенциал (6 У.Е.)
- ✅ Передача → связь (1 У.Е. → другой О.К.)
- ✅ Признание → смысл (У.М. → акт)
- ✅ Сгорание → освобождение (У.Е. → 0)

---

## Примеры полного цикла

### Сценарий 1: Простой цикл

**День 1 (04:00 UTC):**
1. `::alice::` создаёт EMISSION (T1, T2) → 6 У.Е.
2. `::alice::` делает TRANSFER → `::bob::` (1 У.Е.)
3. `::bob::` создаёт У.М. (gratitude) → акт передачи

**День 2 (00:00 UTC):**
4. Метроном сжигает 5 У.Е. у `::alice::` и 1 У.Е. у `::bob::`

**Результат:**
- acts_log: 4 акта (EMISSION, TRANSFER, RECOGNITION, BURNED)
- ro_dag_edges: 3 ребра (FLOW, RECOGNITION, CAUSAL)
- ue_units: 6 записей (status = 'burned')

### Сценарий 2: Цикл с импульсом

**День 1 (21:00 UTC):**
1. `::charlie::` создаёт EMISSION (T3, T5) → 6 У.Е. (impulse)
2. `::charlie::` делает TRANSFER → `::diana::` (1 У.Е.)

**День 2 (00:00 UTC):**
3. Метроном сжигает 5 У.Е. у `::charlie::` и 1 У.Е. у `::diana::`

**Особенность:**
- У.Е. созданы в фазе impulse (20:00-03:59)
- Сгорают в ту же ночь (burn_at = следующая полночь)

---

## Мониторинг цикла

### Логи Метронома

**Просмотр:**
```bash
docker-compose logs backend --tail=50 | grep metronome
```

**Структура:**
```json
{
  "event": "metronome_start|metronome_success|metronome_error",
  "timestamp": "2026-05-04T00:00:00Z",
  "candidates": 42,
  "burned": 42,
  "duration_ms": 1234,
  "level": "info|error"
}
```

### Проверка состояния

**SQL:**
```sql
-- Активные У.Е.
SELECT COUNT(*) FROM ue_units WHERE status IN ('active', 'impulse', 'transferred');

-- Сгоревшие У.Е. за сегодня
SELECT COUNT(*) FROM acts_log WHERE act_type = 'BURNED' AND created_at >= NOW() - INTERVAL '1 day';

-- Рёбра ro.DAG
SELECT edge_type, COUNT(*) FROM ro_dag_edges GROUP BY edge_type;
```

**API:**
```bash
curl http://localhost:3001/api/mirror/::ok.1::
```

---

## Следующие шаги

1. ✅ Цикл зафиксирован (EMISSION → TRANSFER → RECOGNITION → BURN)
2. ✅ Метроном автономен (cron в 00:00 UTC)
3. ✅ Зеркало отражает цикл (/api/mirror)
4. ⏳ Дождаться 00:00 UTC для проверки burn-процесса
5. ⏳ Создать ADR-02 по социальному дыханию

---

**Канон зафиксирован. Система дышит: вдох → движение → признание → выдох.**
