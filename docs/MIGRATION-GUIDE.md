# Migration Guide: sandbox-v0.3.26.05 → backend-v0.4.0

**Статус:** Draft  
**Версия:** 1.0  
**Дата:** 2026-05-04

---

## Цель миграции

Перенести данные из localStorage sandbox-v0.3.26.05 в PostgreSQL backend-v0.4.0 с сохранением:
- Целостности ro.DAG (act_id, refs)
- Хронологии событий (created_at)
- Связей между актами (txId → refs)

---

## Подготовка

### 1. Экспорт данных из sandbox

Откройте sandbox-v0.3.26.05 в браузере и выполните в консоли:

```javascript
// Экспорт всех данных из localStorage
const dump = {
  metadata: {
    version: '0.3.26.05',
    exported_at: new Date().toISOString(),
    source: 'localStorage'
  },
  acts: JSON.parse(localStorage.getItem('acts_log') || '[]'),
  ue_units: JSON.parse(localStorage.getItem('ue_units') || '[]'),
  ok_identity: JSON.parse(localStorage.getItem('ok_identity') || '[]')
};

// Скачать как JSON
const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `sandbox-dump-${Date.now()}.json`;
a.click();
```

### 2. Проверка структуры дампа

Убедитесь, что файл содержит:

```json
{
  "metadata": {
    "version": "0.3.26.05",
    "exported_at": "2026-05-04T17:00:00Z",
    "source": "localStorage"
  },
  "acts": [
    {
      "act_id": "uuid",
      "act_type": "EMISSION",
      "actor_ok": "::ok.1::",
      "target_ok": null,
      "payload": { "triads": ["T1", "T2"], "burn_at": "..." },
      "refs": [],
      "created_at": "2026-05-04T10:00:00Z"
    }
  ],
  "ue_units": [...],
  "ok_identity": [...]
}
```

---

## Запуск миграции

### Dry-run (проверка без изменений)

```bash
cd C:\pygmalion\backend-v0.4.0-clean
node tools/migrate-v3-to-v4.js --input=sandbox-dump-1234567890.json --dry-run
```

Вывод:
```json
{"event":"validation","valid":true,"stats":{"acts_count":42,"ue_units_count":252}}
{"event":"dry_run_complete","message":"Validation passed, no changes made"}
```

### Полная миграция

```bash
node tools/migrate-v3-to-v4.js --input=sandbox-dump-1234567890.json
```

Вывод:
```json
{"event":"migration_start","input":"sandbox-dump-1234567890.json","dry_run":false}
{"event":"load_dump","file":"sandbox-dump-1234567890.json"}
{"event":"validation","valid":true,"stats":{"acts_count":42,"ue_units_count":252}}
{"event":"import_acts_start","count":42}
{"event":"import_acts_complete","imported":42,"skipped":0,"errors":0}
{"event":"replay_ue_start"}
{"event":"replay_ue_emissions","restored":252}
{"event":"replay_ue_transfers","applied":18}
{"event":"replay_ue_burns","applied":6}
{"event":"build_dag_start"}
{"event":"build_dag_complete","edges_created":36}
{"event":"verify_start"}
{"event":"verify_complete","all_passed":true}
{"event":"migration_success","acts_imported":42,"ue_emissions":252,"ue_transfers":18,"ue_burns":6,"dag_edges":36}
```

---

## Этапы миграции

### 1. Валидация входных данных

Проверяет:
- Наличие обязательных полей (acts, ue_units, metadata)
- Структуру актов (act_id, act_type, actor_ok, payload, created_at)
- Формат О.К. (::ok.X::)

### 2. Импорт acts_log

- Сохраняет оригинальные act_id (для целостности ro.DAG)
- Сохраняет refs (связи между актами)
- Идемпотентность: пропускает уже существующие акты
- Батчинг: логирует прогресс каждые 100 актов

### 3. Replay для ue_units

- **Очистка:** `TRUNCATE ue_units` (производная проекция)
- **Восстановление эмиссий:** Для каждой триады (T1-T5) создаёт У.Е. из актов EMISSION
- **Применение передач:** Обновляет actor_ok и status='transferred' из актов TRANSFER
- **Применение сгораний:** Обновляет status='burned' из актов BURNED

### 4. Построение ro_dag_edges

- **Очистка:** `TRUNCATE ro_dag_edges`
- **Построение рёбер:** Извлекает refs из acts_log и создаёт рёбра
- **Типизация:** TRANSFER → FLOW, BURNED → CAUSAL, остальные → CAUSAL

### 5. Верификация целостности

Проверяет:
- **orphan_refs:** Все refs указывают на существующие акты
- **orphan_emissions:** Все ue_units.emission_act_id существуют в acts_log
- **orphan_edges:** Все рёбра указывают на существующие акты
- **ue_balance:** Сумма эмиссий = количество У.Е.

---

## Обработка ошибок

### Ошибка: "Too many errors during import"

**Причина:** Более 10 актов не прошли валидацию

**Решение:**
1. Проверьте формат О.К. в дампе (должен быть `::ok.X::`)
2. Проверьте структуру payload (должен быть валидный JSON)
3. Запустите dry-run для детальной диагностики

### Ошибка: "Integrity verification failed"

**Причина:** Нарушена целостность ro.DAG

**Решение:**
1. Проверьте логи верификации: `{"event":"verify_complete",...}`
2. Найдите проблемные акты (orphan_refs, orphan_emissions, orphan_edges)
3. Исправьте дамп вручную или удалите проблемные акты

### Ошибка: "Validation failed"

**Причина:** Структура дампа не соответствует ожидаемой

**Решение:**
1. Проверьте наличие полей: `metadata`, `acts`, `ue_units`
2. Проверьте структуру актов (см. раздел "Проверка структуры дампа")

---

## Откат миграции

Миграция выполняется в транзакции (BEGIN/COMMIT). При ошибке автоматически откатывается (ROLLBACK).

Для ручного отката:

```sql
-- Очистка всех таблиц
TRUNCATE acts_log CASCADE;
TRUNCATE ue_units CASCADE;
TRUNCATE ro_dag_edges CASCADE;
TRUNCATE ok_identity CASCADE;
```

---

## Постмиграционная проверка

### 1. Проверка количества актов

```bash
docker-compose exec postgres psql -U pygmalion -d pygmalion_v04 -c "SELECT act_type, COUNT(*) FROM acts_log GROUP BY act_type;"
```

Ожидаемый вывод:
```
  act_type  | count
------------+-------
 EMISSION   |    42
 TRANSFER   |    18
 BURNED     |     6
```

### 2. Проверка ro.DAG

```bash
docker-compose exec postgres psql -U pygmalion -d pygmalion_v04 -c "SELECT edge_type, COUNT(*) FROM ro_dag_edges GROUP BY edge_type;"
```

Ожидаемый вывод:
```
 edge_type | count
-----------+-------
 FLOW      |    18
 CAUSAL    |    18
```

### 3. Проверка зеркала присутствия

```bash
curl http://localhost:3000/api/mirror/::ok.1::
```

Должно вернуть корректные данные о присутствии, направлениях, признании.

---

## Лучшие практики

### 1. Тестирование на подмножестве

Перед полной миграцией:
1. Создайте тестовый дамп с 10-20 актами
2. Запустите миграцию на тестовой БД
3. Проверьте целостность и корректность данных

### 2. Резервное копирование

Перед миграцией:
```bash
docker-compose exec postgres pg_dump -U pygmalion pygmalion_v04 > backup-before-migration.sql
```

### 3. Zero-downtime подход

Для продакшена:
1. Создайте новую БД (pygmalion_v04_new)
2. Запустите миграцию в новую БД
3. Проверьте целостность
4. Переключите приложение на новую БД (обновите DATABASE_URL)
5. Удалите старую БД после проверки

---

## Следующие шаги

После успешной миграции:
1. Обновить PROJECT-STATUS.md (отметить миграцию как завершённую)
2. Запустить Replay Test для верификации SSOT
3. Проверить работу Метронома (дождаться 00:00 UTC)
4. Создать ADR-03 по миграции данных

---

**Канон зафиксирован. Миграция сохраняет целостность ro.DAG.**
