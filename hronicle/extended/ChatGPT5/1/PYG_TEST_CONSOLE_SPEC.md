# PYG Test Console — Спецификация MVP

**Версия:** 0.1  
**Статус:** Черновик спецификации  
**Версия бэкенда:** v0.4.1.TEST  
**Назначение:** Мост между Phase 3.9 и Phase 4 — рабочий инструмент тестирования, не документ.

---

## Принципы

1. Все действия через существующие API — никакого обхода Канона
2. Никакого прямого изменения БД
3. Preview → Execute — все операции имеют оба режима
4. После каждого действия: Auto Verify → Replay → Checkpoint
5. READ-ONLY операции не требуют подтверждения

---

## Блоки интерфейса

### 1. Time Machine

```
[Version]
v0.4.1.TEST
v1.0.01
v3.0.01
v4.0.01

[Time]
Current phase: Gestation
+1h         +6h         +24h
[time_slider]
```

- Переключение версии меняет лимиты и доступные триады
- Time shift симулирует фазу (Gestation/Silence/Impulse)
- Preview: показывает какие операции будут доступны

### 2. O.K. Manager

```
[O.K. Manager]
Create O.K.      [Preview] [Execute]
Edit O.K.        [Preview] [Execute]
Archive O.K.     [Preview] [Execute]

[OK List]
::user:1::    активен
::user:2::    активен
```

- Create: POST `/api/ok` — создание новой O.K.
- Edit: PUT `/api/ok/:key` — изменение профиля
- Archive: POST `/api/ok/:key/archive` — архивация
- Preview: показывает какие поля будут изменены

### 3. Emission

```
[Emission]
Triad:    [T1 ▼]   T1-T5
R.U.:     [1-3]
          ────
Emit RU   [Preview] [Execute]
```

- Выбор триады → автоматический показ доступных R.U.
- Preview: показывает что будет записано в acts_log
- Execute: запись через API (не прямой SQL)

### 4. Transfer

```
[Transfer]
From:     [::user:1:: ▼]
To:       [::user:2:: ▼]
R.U.:     [1-3]
          ────
Send RU   [Preview] [Execute]
```

- Доступно только в фазе Gestation
- Preview: показывает путь передачи
- Execute: POST `/api/transfer`

### 5. Burn

```
[Burn]
Pending R.U.:  [12]
Burn window:   24h remaining
Preview Burn   [Preview]
Execute Burn   [Execute]
```

- Preview: показывает какие R.U. сгорят и какие R.M. образуются
- Execute: POST `/api/burn`

### 6. Replay

```
[Replay]
Period:        [Today ▼]
Run Replay     [Execute]

Results:
✓ SSOT match: 12/12 R.U. verified
✗ Mismatches: 0
```

- Читает acts_log, реконструирует R.U., сверяет с emission-policy
- Вывод: pass/fail с детализацией по триадам
- Всегда Execute (нет Preview — это верификация)

### 7. Presence

```
[Presence]
Show Presence  [Execute]

O.K.         R.U.    R.M.    Status
::user:1::   12      8       active
::user:2::   5       3       silence
```

- GET `/api/presence` — поток R.U. в окне времени
- READ-ONLY — только Execute

### 8. Version Switcher

```
[Version]
v0.4.1.TEST    ◉ (текущая)
v1.0.01        ○
v3.0.01        ○
v4.0.01        ○

Лимиты обновлены: 13 R.U./день → 20 R.U./день
Триады: T1-T5
```

- Переключение обновляет: лимиты, доступные триады, фазовые окна
- Auto Verify после переключения

---

## TEST-CYCLE-01

Полный прожиг жизненного цикла:

1. **O.K.** — создать 2 O.K.
2. **Presence** — проверить присутствие
3. **Emission** — эмитировать R.U. (триады T1-T3)
4. **Transfer** — передать R.U. между O.K.
5. **Silence** — дождаться/симулировать Silence
6. **Burn** — выполнить Burn
7. **Replay** — верификация
8. **Presence** — финальная проверка

После каждого шага: Auto Verify → Replay → Checkpoint

## API Endpoints (для реализации)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка сервера |
| GET | `/api/ok` | Список O.K. |
| POST | `/api/ok` | Создать O.K. |
| PUT | `/api/ok/:key` | Редактировать O.K. |
| POST | `/api/ok/:key/archive` | Архивация |
| POST | `/api/emission` | Эмиссия R.U. |
| POST | `/api/transfer` | Передача R.U. |
| POST | `/api/burn` | Сжигание |
| GET | `/api/replay` | Replay верификация |
| GET | `/api/presence` | Присутствие |
| GET | `/api/canon/version` | Текущая версия Канона |
| GET | `/api/canon/phase` | Текущая фаза |
| GET | `/api/canon/limits` | Лимиты для версии |

## Технические заметки

- Интерфейс: HTML + CSS + JS (один файл, zero deps)
- Preview — локальный расчёт (без вызова API)
- Execute — вызов API с ключом `PYGMALION_API_KEY`
- Docker/PostgreSQL должны быть доступны для Execute
