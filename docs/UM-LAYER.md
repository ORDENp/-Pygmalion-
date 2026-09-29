# У.М. — Слой Признания (Учётные Маркеры)

**Статус:** Accepted  
**Версия:** 1.0  
**Дата:** 2026-05-04

---

## Философия У.М.

У.М. (Учётные Маркеры) — это **не оценка, а свидетельство признания**.

### Что это НЕ

- ❌ Не баланс (не накапливается)
- ❌ Не рейтинг (не сравнивается)
- ❌ Не валюта (не передаётся)
- ❌ Не лайк (не количество)
- ❌ Не комментарий (не обсуждение)

### Что это ЕСТЬ

- ✅ Фиксация того, что было признано ценным
- ✅ Свидетельство смысла действия
- ✅ Утолщение ro.DAG (связь между актами)
- ✅ След признания, а не перенос числовой ценности

---

## Каноническая структура

У.М. записывается через `acts_annotations` с типом `RECOGNITION`.

### Payload Contract (JSONB)

```json
{
  "marker_type": "value",
  "marker_text": "Сохранил спокойствие в сложной ситуации",
  "witness_scope": "observation",
  "triad_link": "T1",
  "context": {}
}
```

### Поля

#### `marker_type` (обязательно)

Тип признания — **ограниченный словарь**:

- `value` — признание ценности
- `gratitude` — благодарность
- `alignment` — совпадение по смыслу
- `witness` — свидетельство (я видел это)
- `support` — поддержка

**Важно:** Это язык, а не шкала.

#### `marker_text` (обязательно)

Короткая фиксированная формулировка (до 280 символов):

- Не поток текста
- Не обсуждение
- А **фиксированная формулировка смысла**

Примеры:
- "Вклад в общее дело"
- "Помог разобраться в сложной теме"
- "Сохранил спокойствие в конфликте"

#### `witness_scope` (обязательно)

Характер свидетельства — **глубина участия**:

- `personal` — личное участие (я был частью этого)
- `observation` — наблюдение (я видел это)
- `indirect` — косвенное свидетельство (я знаю об этом)

**Критично:** Это не оценка близости, а **тип связи со следом**.

#### `triad_link` (опционально)

Связь с триадой акта (T1-T5):

- Усиливает контекст признания
- Показывает, в какой области проявилась ценность
- Не влияет на вес или рейтинг

#### `intensity` (устарело, опционально)

**Предупреждение:** Поле сохранено для обратной совместимости, но **не рекомендуется** к использованию.

Риск: почти гарантированно начнёт тянуться к агрегации ("средняя intensity", "сумма intensity").

Если используется — только как локальное свойство, **никогда не агрегировать**.

#### `context` (опционально)

Дополнительный контекст (JSONB):

```json
{
  "triad": "T1",
  "related_acts": ["act_id_1", "act_id_2"]
}
```

---

## Правила канона

### 1. Автор ≠ Актор

```sql
author_ok != (SELECT actor_ok FROM acts_log WHERE act_id = act_ref_id)
```

Нельзя признавать самого себя.

### 2. Уникальность признания

```sql
UNIQUE (act_ref_id, author_ok, marker_type)
```

Один О.К. не может дублировать один и тот же тип признания для одного акта.

Но может дать **разные типы** признания:
- `::ok.1::` → `value` для акта A ✅
- `::ok.1::` → `gratitude` для акта A ✅
- `::ok.1::` → `value` для акта A (повторно) ❌

### 3. Связь с ro.DAG

Каждый У.М.:
- Ссылается на `act_ref_id` (акт в acts_log)
- Утолщает граф, а не добавляет число
- Создаёт ребро признания в ro.DAG

### 4. Нет агрегации

**Запрещено:**
- `SUM(intensity)` — превращает в балл
- `COUNT(*)` как рейтинг — превращает в соцсеть
- `total_marks` — разрушает канон

**Разрешено:**
- Показывать последние У.М. (характер признания)
- Отражать форму признания (не количество)

---

## Интеграция с системой

### Связь с У.Е.

- **У.Е.** → импульс (acts_log, EMISSION/TRANSFER)
- **У.М.** → признание (acts_annotations, RECOGNITION)

Они связаны, но **не равны**.

### Связь с ro.DAG

```
act_emission (EMISSION)
    ↓
act_transfer (TRANSFER)
    ↓
annotation (RECOGNITION) ← утолщает граф
```

### Связь с зеркалом присутствия

`/api/mirror` показывает **форму признания**, не количество:

```json
{
  "recognition": {
    "recent_markers": [
      {
        "type": "value",
        "text": "Вклад в общее дело",
        "from": "::ok.2::",
        "at": "2026-05-04T14:00:00Z",
        "intensity": 2
      },
      {
        "type": "gratitude",
        "text": "Помог разобраться",
        "from": "::ok.3::",
        "at": "2026-05-04T13:00:00Z",
        "intensity": 1
      }
    ]
  }
}
```

**Без:**
- `total_marks`
- `score`
- `rating`

---

## Граница канона

Если в будущем появится желание:
- Сложить `intensity`
- Посчитать `total_marks`
- Вывести `score`

— это момент, где система начинает деградировать в соцсеть.

**Правило:**
> У.М. — это фиксация смысла, а не перенос числовой ценности.

---

## Схема БД (обновление acts_annotations)

```sql
CREATE TABLE IF NOT EXISTS acts_annotations (
    annotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Связь со следом (факт)
    act_ref_id UUID NOT NULL REFERENCES acts_log(act_id),

    -- Кто свидетельствует
    author_ok TEXT NOT NULL CHECK (author_ok ~ '^::[0-9A-Za-z._-]+::$'),

    -- Тип интерпретации
    annotation_type TEXT NOT NULL CHECK (
        annotation_type IN ('VALUATION', 'DISPUTE', 'NOTE', 'RECOGNITION')
    ),

    -- Payload (для RECOGNITION — структура У.М.)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Устаревшее поле (для обратной совместимости)
    value TEXT,

    -- Статус
    status TEXT DEFAULT 'active',

    -- Временная фиксация
    created_at TIMESTAMP DEFAULT NOW(),

    -- Уникальность: один О.К. не дублирует одно и то же признание
    CONSTRAINT unique_recognition UNIQUE (
        act_ref_id, 
        author_ok, 
        (payload->>'marker_type')
    )
);
```

---

## API Endpoints

### POST /api/annotations

Создание У.М.:

```json
{
  "act_ref_id": "uuid",
  "author_ok": "::ok.1::",
  "annotation_type": "RECOGNITION",
  "payload": {
    "marker_type": "value",
    "marker_text": "Вклад в общее дело",
    "witness_scope": "observation",
    "triad_link": "T1"
  }
}
```

**Валидация:**
- `author_ok` ≠ `actor_ok` акта
- `marker_type` из словаря (value|gratitude|alignment|witness|support)
- `marker_text` до 280 символов
- `witness_scope` обязательно (personal|observation|indirect)
- `triad_link` опционально (T1-T5)

**Побочный эффект:**
- Создаётся ребро в `ro_dag_edges`: author_ok → act_ref_id (тип: RECOGNITION)

### GET /api/mirror/:ok_id

Зеркало присутствия с У.М. и ВЕС:

```json
{
  "ok_id": "::ok.1::",
  "presence": {
    "ue_flow": 6,
    "window_start": "2026-05-04T00:00:00Z"
  },
  "trace": {
    "last_act_at": "2026-05-04T14:00:00Z",
    "silence_hours": 0.5
  },
  "burn": {
    "last_burn_at": "2026-05-04T14:06:09Z",
    "burned_recently": 6
  },
  "recognition": {
    "recent_markers": [
      {
        "type": "value",
        "text": "Вклад в общее дело",
        "witness_scope": "observation",
        "triad_link": "T1",
        "from": "::ok.2::",
        "at": "2026-05-04T14:00:00Z"
      }
    ]
  },
  "directions": {
    "given": {
      "count": 8,
      "direction": "outward"
    },
    "received": {
      "count": 5,
      "direction": "inward"
    },
    "burned": {
      "count": 3,
      "direction": "release"
    }
  }
}
```

**Важно:**
- `directions` — это **векторы**, не скаляр
- Нет `total_weight`, `score`, `karma`
- Каждое направление независимо
- Это геометрия поведения, не рейтинг

---

## Переход от Фазы 1 к Фазе 2

**Фаза 1 (Фундамент):**
- Учёт действий (EMISSION, TRANSFER, BURNED)
- Физика системы (Метроном, триады, сгорание)

**Фаза 2 (Социальное дыхание):**
- Фиксация смысла действий (У.М.)
- Признание ценности (не оценка)
- Утолщение ro.DAG (связи между актами)

Это очень тонкий слой, и именно он определит, останется ли система:
- **Пространством присутствия** ✅
- Или превратится в очередную систему метрик ❌

---

## Примеры использования

### Сценарий 1: Признание ценности

1. `::alice::` создаёт EMISSION (T1, T2)
2. `::alice::` делает TRANSFER → `::bob::`
3. `::bob::` создаёт У.М.:
   ```json
   {
     "act_ref_id": "transfer_act_id",
     "author_ok": "::bob::",
     "annotation_type": "RECOGNITION",
     "payload": {
       "marker_type": "gratitude",
       "marker_text": "Помог разобраться в сложной теме",
       "intensity": 2
     }
   }
   ```

### Сценарий 2: Свидетельство

1. `::charlie::` наблюдает акт `::alice::`
2. `::charlie::` создаёт У.М.:
   ```json
   {
     "act_ref_id": "emission_act_id",
     "author_ok": "::charlie::",
     "annotation_type": "RECOGNITION",
     "payload": {
       "marker_type": "witness",
       "marker_text": "Видел, как это помогло команде",
       "intensity": 1
     }
   }
   ```

---

## Следующие шаги

1. ✅ Документ создан (UM-LAYER.md)
2. ⏳ Обновить schema (acts_annotations + constraint)
3. ⏳ Адаптировать `/api/annotations`
4. ⏳ Обновить `/api/mirror`
5. ⏳ Тестирование

---

**Канон зафиксирован. У.М. — это признание, не метрика.**
