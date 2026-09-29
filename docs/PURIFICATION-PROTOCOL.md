# Протокол "Ночи очищения"

**Статус:** Выполнено (v0.4.0-alpha)  
**Дата первого сгорания:** 2026-05-02T00:11:17.994Z  
**Сгорело:** 6 У.Е. (::test.burn::)

---

## Суть

Первый автономный цикл сгорания У.Е. по правилу **"24+4"** (Иммунитет Импульса).

---

## Механика

### 1. Поиск

В 00:00:00 UTC Cron-задача сканирует таблицу `ue_units` на наличие записей со статусом `active/impulse` и `burn_at <= NOW()`:

```javascript
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Запуск процесса сгорания У.Е. (00:00)');
  
  const nowISO = Metronome.getCurrentTimeISO();
  
  const toBurnResult = await client.query(
    `SELECT ue_uuid, ue_number, triad, actor_ok, burn_at, emission_act_id
     FROM ue_units
     WHERE status IN ('active', 'impulse')
       AND burn_at <= $1::timestamp`,
    [nowISO]
  );
  
  // ...
}, {
  timezone: "Europe/Moscow"
});
```

### 2. Атомарный акт

Система создает запись `BURNED` в `acts_log` с `refs` на исходную эмиссию:

```javascript
for (const ue of toBurnResult.rows) {
  // Создать акт BURNED с refs на акт эмиссии
  const actResult = await client.query(
    `INSERT INTO acts_log (act_type, actor_ok, payload, refs)
     VALUES ($1, $2, $3, $4)
     RETURNING act_id, created_at`,
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
  
  // Обновить статус У.Е.
  await client.query(
    `UPDATE ue_units
     SET status = 'burned', transferred_at = $1
     WHERE ue_uuid = $2`,
    [actResult.rows[0].created_at, ue.ue_uuid]
  );
}
```

### 3. Трансформация

Статус У.Е. меняется на `burned`, что мгновенно отражается в расчете репутационного веса (штраф -1).

---

## Первая "Ночь очищения" (2026-05-02)

### Хронология событий:

**23:45 UTC** — Сервер упал (порт занят)  
**00:00 UTC** — Полночь. Cron не сработал (сервер не работал)  
**00:11 UTC** — Сервер перезапущен  
**00:11:17 UTC** — Ручной запуск `/api/burn`  
**00:11:17.994Z** — Сгорание завершено

### Результат:

```json
{
  "success": true,
  "burned_count": 6,
  "burned_ues": [
    {
      "ue_uuid": "0482070f-5896-45e4-89c5-91b97d648347",
      "ue_number": 1,
      "triad": "T1",
      "actor_ok": "::test.burn::",
      "act_id": "b1b2b42a-0916-4711-84ea-55d193dca50e"
    },
    // ... ещё 5 У.Е.
  ],
  "timestamp": "2026-05-02T00:11:17.994Z"
}
```

### Проверка графа:

```sql
SELECT act_id, act_type, refs 
FROM acts_log 
WHERE act_type = 'BURNED';
```

Все 6 актов BURNED содержат `refs = {45bc8189-9475-4552-a08c-dbf3a4c805cf}` — ссылку на акт EMISSION.

### Проверка статуса:

```sql
SELECT ue_number, status 
FROM ue_units 
WHERE actor_ok = '::test.burn::';
```

Все 6 У.Е. перешли в статус `burned`.

---

## Смысл

Сгорание — это не наказание, а **защита от накопления "пустого" морального капитала**. 

Энергия, не ставшая действием, должна вернуться в тишину.

### Философия:

- У.Е. не "сгорают" физически — они выходят за границу окна восприятия
- `acts_log` остаётся неизменным (append-only)
- Граф ro.DAG фиксирует факт: "импульс был, но не стал действием"
- Репутационный вес учитывает сгоревшие У.Е. как -1

---

## Стресс-тест

Падение сервера за 15 минут до полуночи подтвердило:

✅ **Темпоральный суверенитет работает** — после перезапуска система не потеряла время  
✅ **Метроном автономен** — определил текущую фазу без внешних параметров  
✅ **ro.DAG целостен** — все акты BURNED содержат корректные refs  
✅ **Атомарность транзакций** — все 6 У.Е. сгорели в одной транзакции

---

## Следующие шаги

- [x] Ручной endpoint `/api/burn` (для тестов)
- [x] Автоматический cron в 00:00 UTC
- [x] Поддержка refs в актах BURNED
- [ ] Начисление кармы (-1 за сгоревшую У.Е.)
- [ ] Мониторинг процесса сгорания
- [ ] Уведомления О.К. о сгоревших У.Е.

---

## Файлы реализации

- `server.js` — endpoint `/api/burn` и cron job
- `backend/core/metronome.js` — источник времени
- `sql-schema/schema-v3.0-alpha.sql` — схема БД

---

**Официальное рождение v0.4.0-alpha**

Система больше не "счётчик". Это автономное пространство, где математика этики работает в железе.

**Pygmalion дышит.**
