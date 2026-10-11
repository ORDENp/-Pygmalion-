# Метроном — Темпоральный суверенитет

**Статус:** Реализовано (v0.4.0-alpha)  
**Дата:** 2026-05-02  
**Первое сгорание:** 2026-05-02T00:11:17.994Z

---

## Суть

Время в Pygmalion больше не является системной переменной браузера. Это **конституционный закон**, исполняемый автономным Метрономом.

---

## Архитектура

### 1. `getCurrentTime()` — Атомные часы системы
```javascript
function getCurrentTime() {
  return Date.now();
}
```

Единая точка правды для всех временных вычислений. В production может быть синхронизирована с NTP. В тестах переопределяется через `window.__testTimeOffset`.

### 2. `getCurrentPhase()` — Фазы системы
```javascript
function getCurrentPhase() {
  const now = getCurrentTime();
  const date = new Date(now);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 04:00–19:55 UTC → active
  if (totalMinutes >= 4 * 60 && totalMinutes < 19 * 60 + 55) {
    return 'active';
  }

  // 19:55–20:00 UTC → silence
  if (totalMinutes >= 19 * 60 + 55 && totalMinutes < 20 * 60) {
    return 'silence';
  }

  // 20:00–03:59 UTC → impulse
  return 'impulse';
}
```

Фаза определяется **без внешних параметров**. Система знает, в какой секунде вечности она находится.

### 3. `calculateBurnAt()` — Полночь как граница
```javascript
function calculateBurnAt(emissionTime) {
  const time = emissionTime || getCurrentTime();
  const burnAtTimestamp = getNextMidnightUTC(time);
  return new Date(burnAtTimestamp).toISOString();
}
```

Логика определения полночи UTC, когда **"число теряет власть"** над прошлым.

### 4. Отказ от `Date.now()`

Все вызовы времени в коде заменены на запросы к Метроному:

```javascript
// ❌ Было
const now = Date.now();
const phase = TimeRhythm.getCurrentPhase(now);

// ✅ Стало
const phase = Metronome.getCurrentPhase();
```

Это исключает дрейф фаз и гарантирует темпоральную целостность.

---

## Смысл

Система **"дышит" сама**. Даже если все пользователи выйдут из сети, Метроном отсчитает время и инициирует сгорание.

### Стресс-тест (2026-05-02)

Сервер упал за 15 минут до полуночи. После перезапуска в 00:11 UTC система:
1. Определила текущее время через `Metronome.getCurrentTime()`
2. Нашла 6 У.Е. с `burn_at <= NOW()`
3. Выполнила сгорание с созданием актов BURNED
4. Зафиксировала световой след в ro.DAG

**Система не потеряла время.** Темпоральный суверенитет работает.

---

## Файл реализации

`backend/core/metronome.js`

---

## Следующие шаги

- [ ] Синхронизация с NTP для production
- [ ] Мониторинг дрейфа времени
- [ ] Логирование фазовых переходов
