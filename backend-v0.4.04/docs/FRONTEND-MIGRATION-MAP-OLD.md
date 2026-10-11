# Frontend Migration Map — 0.3.26.05 → 0.4.0

**Дата анализа:** 09.05.2026  
**Источник:** `C:\pygmalion\archive\sandbox-v0.3.26.05\`  
**Цель:** Выделить ценные элементы для переноса в 0.4.0

---

## Живые состояния

### 1. Burn Timer — темпоральная граница

**Реализация в 0.3.26.05:**
```javascript
// logic.js, строка 199-228
function calculateBurnAt(createdAt) {
    const time = new Date(createdAt || getInternalTime().getTime());
    const hour = time.getHours();
    const burn = new Date(time);
    
    // Правило 24+4: если заказ после 20:00, прибавляем +2 дня до полуночи
    if (hour >= 20) {
        burn.setDate(burn.getDate() + 2);
        burn.setHours(0, 0, 0, 0);
    } else if (hour < 4) {
        burn.setDate(burn.getDate() + 1);
        burn.setHours(0, 0, 0, 0);
    } else {
        burn.setDate(burn.getDate() + 1);
        burn.setHours(0, 0, 0, 0);
    }
    return burn.getTime();
}

// Обновление каждую секунду
function updateBurnTimer() {
    const timerEl = $('#burn-timer');
    if (!timerEl) return;
    
    const now = getInternalTime();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    
    const diff = nextMidnight - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    timerEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
```

**HTML (index.html, строка 96-100):**
```html
<div class="timer-display">
  <span data-i18n="act1_timer">До сгорания У.Е.:</span>
  <span class="timer-value" id="burn-timer">--:--:--</span>
</div>
```

**Что ощущалось живым:**
- Обратный отсчёт обновлялся **каждую секунду** (не после перезагрузки)
- Создавал ощущение **темпоральной границы** — не абстрактное "в полночь", а конкретный countdown
- Визуальная связь с метрономом системы
- Ощущение **ритма системы** (система дышит сама)

**Почему это критично:**
Backend становится видимым. Пользователь чувствует, что система живёт во времени без наблюдателя.

### 2. УЕ Indicators — визуальные точки состояния

**Реализация в 0.3.26.05:**

**HTML (index.html, строки 102-116):**
```html
<!-- Импульсные У.Е. (заказанные, но не активированные) -->
<div class="ue-indicators impulse" id="impulse-indicators">
  <span class="ue-indicator" data-ue="1">—</span>
  <span class="ue-indicator" data-ue="2">—</span>
  <span class="ue-indicator" data-ue="3">—</span>
  <!-- ... до 12 + №21 -->
</div>

<!-- Активные У.Е. (эмитированные, доступные для передачи) -->
<div class="ue-indicators active" id="active-indicators">
  <span class="ue-indicator" data-ue="1">—</span>
  <!-- ... -->
</div>
```

**CSS (style.css, строки 394-466):**
```css
.ue-indicator {
  display: inline-block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  text-align: center;
  line-height: 28px;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  transition: all 0.3s ease;
}

/* Цветовая кодировка по триадам */
.ue-indicator[data-ue="1"].active,
.ue-indicator[data-ue="2"].active,
.ue-indicator[data-ue="3"].active {
  background: rgba(239,68,68,0.2);  /* T1: Знания (красный) */
  border-color: #ef4444;
  color: #ef4444;
}

.ue-indicator[data-ue="4"].active,
.ue-indicator[data-ue="5"].active,
.ue-indicator[data-ue="6"].active {
  background: rgba(250,204,21,0.2);  /* T2: Практики (жёлтый) */
  border-color: #facc15;
  color: #facc15;
}

/* ... T3 (зелёный), T4 (синий), T5 (фиолетовый) */

.ue-indicator.impulse {
  background: rgba(100,150,255,0.1);
  border-color: rgba(100,150,255,0.3);
  animation: pulse 2s infinite;
}
```

**JavaScript обновление (logic.js):**
```javascript
function updateUEIndicatorsFromState() {
  // Импульсные индикаторы
  const impulseContainer = $('#impulse-indicators');
  impulseContainer.querySelectorAll('.ue-indicator').forEach(ind => {
    const ueId = parseInt(ind.dataset.ue);
    const ue = AppState.ueUnits.find(u => u.id === ueId);
    
    if (ue && ue.status === 'impulse' && ue.amount > 0) {
      ind.classList.add('impulse');
      ind.textContent = '●';
    } else {
      ind.classList.remove('impulse');
      ind.textContent = '—';
    }
  });
  
  // Активные индикаторы
  const activeContainer = $('#active-indicators');
  activeContainer.querySelectorAll('.ue-indicator').forEach(ind => {
    const ueId = parseInt(ind.dataset.ue);
    const ue = AppState.ueUnits.find(u => u.id === ueId);
    
    if (ue && ue.status === 'active' && ue.amount > 0) {
      ind.classList.add('active');
      ind.textContent = '●';
    } else {
      ind.classList.remove('active');
      ind.textContent = '—';
    }
  });
}
```

**Что ощущалось живым:**
- **Два набора индикаторов** одновременно: "Импульс" (заказанные) и "Активные" (эмитированные)
- **Немедленная визуальная обратная связь** — индикаторы загорались/гасли мгновенно при действиях
- **Цветовая кодировка по триадам** — визуальная связь между семантикой (Знания/Практики/Творчество) и У.Е.
- **Состояния**: `—` (пусто), `●` (заполнено), цветная точка (триада)
- **Пульсация импульсных** — animation: pulse 2s infinite

**Почему это создавало плотность:**
Человек видел **полный цикл жизни У.Е.** от заказа (impulse) до активации (active) до передачи (исчезновение). Визуальная связь между действием и результатом была **немедленной**.

**Что ощущалось живым:**
- Горизонтальная шкала с центральной точкой (0%)
- Заполнение шкалы в зависимости от репутационного тонуса
- Визуальная метафора **баланса** (не роста, а равновесия)

**Почему это работало:**
- Не gamification (нет "прогресса к цели")
- Метафора **зеркала** — отражение текущего состояния, не накопление
- Центральная точка создавала ощущение **нейтральности** (можно быть в нуле)

### 3. Зеркало присутствия (Spiritual Scale)

**Реализация в 0.3.26.05:**

**HTML (index.html, строки 152-161):**
```html
<div class="spiritual-scale-wrapper">
  <span class="scale-label" data-i18n="mirror_label">Зеркало присутствия:</span>
  <div class="spiritual-scale-container">
    <div class="scale-center" id="scale-center"></div>
    <div id="spiritual-fill" class="scale-fill" style="width: 0%;"></div>
  </div>
  <span id="spiritual-value" class="scale-value">0%</span>
</div>
```

**CSS (style.css, строки 914-931):**
```css
.spiritual-scale-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.spiritual-scale-container {
  position: relative;
  width: 200px;
  height: 8px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  overflow: hidden;
}

.scale-center {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background: rgba(255,255,255,0.3);
  z-index: 1;
}

.scale-fill {
  position: absolute;
  left: 50%;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(100,150,255,0.6), rgba(100,200,150,0.6));
  transition: width 0.5s ease;
  transform-origin: left;
}
```

**JavaScript (logic.js):**
```javascript
function updateSpiritualScale() {
  const fillEl = $('#spiritual-fill');
  const valueEl = $('#spiritual-value');
  
  // Репутационный тонус от -100% до +100%
  const tone = calculateReputationTone(); // -1.0 до +1.0
  const percentage = Math.round(tone * 100);
  
  // Заполнение от центра (50%) влево или вправо
  if (tone >= 0) {
    fillEl.style.left = '50%';
    fillEl.style.width = `${tone * 50}%`; // 0-50%
  } else {
    fillEl.style.left = `${50 + tone * 50}%`; // 50-0%
    fillEl.style.width = `${Math.abs(tone) * 50}%`;
  }
  
  valueEl.textContent = `${percentage > 0 ? '+' : ''}${percentage}%`;
}
```

**Что ощущалось живым:**
- **Горизонтальная шкала с центральной точкой** (0%) — не "прогресс к 100%", а **баланс**
- **Заполнение от центра** влево (отрицательный тонус) или вправо (положительный)
- **Визуальная метафора равновесия**, не роста
- **Центральная точка = нейтральность** — можно быть в нуле, это допустимое состояние

**Почему это работало:**
- Не gamification (нет "прогресса к цели")
- Метафора **зеркала** — отражение текущего состояния, не накопление
- Визуальная связь с ro.DAG (баланс между отданным и полученным)

**Что ощущалось живым:**
- Бейдж О.К. в header с иконкой 🔑
- Пульсирующая анимация (`badgePulse` 3s infinite)
- Изменение цвета при эмиссии (`emission-active` → зелёное свечение)
- Дата создания О.К. рядом с ключом

**Почему это создавало присутствие:**
- О.К. **всегда виден** (persistent в header)
- Пульсация создавала ощущение **живого объекта**
- Реакция на действия (эмиссия → glow) давала **обратную связь**

---

### 4. О.К. Badge с пульсацией

**Реализация в 0.3.26.05:**

**HTML (index.html, строки 21-28):**
```html
<div class="ok-badge-container" id="ok-badge-container" style="display: none;">
  <div class="ok-badge" id="ok-badge">
    <span class="ok-icon" id="ok-icon">🔑</span>
    <span class="ok-value" id="ok-value">::____::</span>
    <span class="ok-date" id="ok-date"></span>
  </div>
</div>
```

**CSS (style.css, строки 148-176):**
```css
.ok-badge-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ok-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  animation: badgePulse 3s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 10px rgba(100,150,255,0.3); }
  50% { box-shadow: 0 0 20px rgba(100,150,255,0.5); }
}

.ok-badge.emission-active {
  animation: badgeGlow 1s ease-in-out 3;
  border-color: rgba(34,197,94,0.5);
}

@keyframes badgeGlow {
  0%, 100% { box-shadow: 0 0 10px rgba(34,197,94,0.3); }
  50% { box-shadow: 0 0 25px rgba(34,197,94,0.7); }
}
```

**JavaScript (logic.js):**
```javascript
function showOKBadge(okKey, createdDate) {
  const container = $('#ok-badge-container');
  const badge = $('#ok-badge');
  const valueEl = $('#ok-value');
  const dateEl = $('#ok-date');
  
  valueEl.textContent = okKey;
  dateEl.textContent = new Date(createdDate).toLocaleDateString('ru-RU');
  container.style.display = 'flex';
  
  // При эмиссии — вспышка
  badge.classList.add('emission-active');
  setTimeout(() => badge.classList.remove('emission-active'), 3000);
}
```

**Что ощущалось живым:**
- **Persistent в header** — О.К. всегда виден
- **Пульсирующая анимация** (badgePulse 3s infinite) — создавала ощущение "живого объекта"
- **Реакция на действия** — при эмиссии badge вспыхивал зелёным (badgeGlow)
- **Дата создания О.К.** рядом с ключом — темпоральный контекст

**Почему это создавало присутствие:**
О.К. не просто идентификатор, а **живой объект** с состоянием. Пульсация + реакция на действия давали **обратную связь**.

### 1. Двухэтапный выбор (Триада → Эмиссия)

**Паттерн:**
1. Выбор триады (T1-T5) → подсветка соответствующих У.Е. в индикаторах
2. Кнопка "Эмитировать" → перенос из "Импульс" в "Активные"

**Почему это давало чувство поля:**
- **Осознанный выбор** (не одна кнопка "создать")
- **Визуальная связь** между триадой и У.Е. (цветовая кодировка)
- **Промежуточное состояние** (импульс) перед активацией

### 2. Выбор получателя через модальное окно

**Паттерн:**
1. Выбор активной У.Е. → клик "Передать"
2. Модальное окно с выбором получателя (12 тестовых О.К.)
3. Подтверждение → У.Е. переходит в "Отданные"

**Почему это работало:**
- **Пауза перед действием** (модальное окно = момент рефлексии)
- **Явный выбор получателя** (не автоматическая передача)
- **Финальность действия** (подтверждение = осознанность)

### 3. Фазы дня как контекст действий

**Паттерн:**
- Индикатор фазы между Актом 1 и Актом 2
- Иконка + название + временной диапазон
- Фазы: Действие (🌞 04:00-19:55), Тишина (🌙 19:55-20:00), Сон (💤 20:00-04:00)

**Почему это давало чувство поля:**
- **Темпоральный контекст** (не абстрактное время, а фазы)
- **Визуальная метафора** (иконки создавали атмосферу)
- **Ритм системы** (не человек управляет временем, а время управляет системой)

---

## Плотность присутствия

### Элементы, создававшие плотность:

1. **Триадная система (T1-T5)**
   - Цветовая кодировка (красный/жёлтый/зелёный/синий/фиолетовый)
   - Семантические категории (Знания/Практики/Творчество/Досуг/№21)
   - Визуальная связь между триадой и У.Е.

2. **Индикаторы У.Е. (13 позиций)**
   - Два набора индикаторов: "Импульс" и "Активные"
   - Состояния: `—` (пусто), `●` (заполнено), цветная точка (триада)
   - Немедленная визуальная обратная связь

3. **Burn Timer**
   - Обратный отсчёт до полуночи (20:00 UTC)
   - Формат `HH:MM:SS`
   - Создавал ощущение **темпоральной границы**

4. **У.М. Balance**
   - Счётчик У.М. (Учётных Маркеров)
   - Изменялся при получении признания
   - Визуальная связь с ro.DAG (получение → увеличение баланса)

5. **Статистика (Отдано/Получено/Сгорело)**
   - Три счётчика в footer
   - Разделение на "Сегодня" и "Всего"
   - Создавало ощущение **истории присутствия**

---

## Визуальные паттерны

### Цветовая система

```css
--bg-primary: #0a0a0f;        /* pure-black (как в 0.4.0) */
--bg-secondary: #1a1a2e;      /* layered surfaces */
--bg-tertiary: #16213e;       /* elevated elements */
--text-primary: #e2e8f0;      /* soft white */
--text-secondary: #94a3b8;    /* muted */
--accent-blue: #3b82f6;       /* primary accent */
--accent-green: #22c55e;      /* success/active */
--accent-red: #ef4444;        /* T1 (Знания) */
--accent-yellow: #facc15;     /* T2 (Практики) */
--accent-purple: #a855f7;     /* T5 (№21) */
```

**Наблюдение:**
- Pure-black background (как в 0.4.0)
- Яркие акценты (blue/green/red/yellow/purple)
- Высокий контраст (читаемость)

### Типографика

- Font: `'Inter', Arial, sans-serif` (уже используется в плане 0.4.0)
- Sizes: 0.75rem - 1.5rem
- Line-height: 1.6
- Letter-spacing: 0.05em (для brand name)

### Анимации

1. **badgePulse** (3s infinite)
   - Пульсация О.К. badge
   - Box-shadow от 10px до 20px
   - Создавало ощущение "живого объекта"

2. **badgeGlow** (1s, 3 iterations)
   - Вспышка при эмиссии
   - Зелёное свечение (accent-green)
   - Обратная связь на действие

3. **Backdrop blur** (10px)
   - Header с `backdrop-filter: blur(10px)`
   - Создавало ощущение depth

---

## Карта переноса

| Элемент | Ценность | Переносить? | Как адаптировать |
|---------|----------|-------------|------------------|
| **Триадная система (T1-T5)** | Высокая — создавала семантическую структуру | ❌ Нет | В 0.4.0 нет триад, есть ro.DAG. Не переносить. |
| **Индикаторы У.Е. (визуальные точки)** | Высокая — немедленная обратная связь | ⚠️ Частично | Адаптировать для ro.DAG: узлы в field.html как "живые точки" |
| **Burn Timer** | Критическая — создавал темпоральную границу | ✅ Да | Добавить в observer.html как "Next burn in" |
| **О.К. Badge с пульсацией** | Средняя — persistent presence | ⚠️ Частично | Упростить: persistent О.К. в header без пульсации (тишина) |
| **Зеркало присутствия (Spiritual Scale)** | Высокая — метафора баланса, не роста | ✅ Да | Адаптировать для ro.DAG: визуализация in_tree / outside_tree как баланс |
| **Фазы дня (Действие/Тишина/Сон)** | Средняя — темпоральный контекст | ❌ Нет | В 0.4.0 есть cycle phases (gestation/weaving/silence). Не дублировать. |
| **Модальное окно выбора получателя** | Высокая — пауза перед действием | ✅ Да | Сохранить паттерн: модальное окно для TRANSFER в будущем |
| **Статистика (Отдано/Получено/Сгорело)** | Средняя — история присутствия | ⚠️ Частично | Перенести в observer.html как "Acts (24h)" |
| **Backdrop blur в header** | Низкая — визуальный эффект | ❌ Нет | Противоречит "restrained high-tech". Не переносить. |
| **Цветовая кодировка триад** | Высокая — визуальная связь | ⚠️ Частично | Адаптировать: цветовая кодировка для ro.DAG статусов (in_tree/received_um/outside_tree) |
| **Двухэтапный выбор (Триада → Эмиссия)** | Высокая — осознанность действия | ✅ Да | Сохранить паттерн: выбор → подтверждение для критических действий |

---

## Ключевые находки для 0.4.0

### 1. Burn Timer — критический элемент

**Почему:**
- Создавал **темпоральную границу** (не абстрактное "в полночь", а конкретный countdown)
- Ощущение **ритма системы** (система дышит сама)
- **Обратная связь** на метроном (backend становится видимым)

**Как перенести:**
- Добавить в `observer.html` как "Next burn in: HH:MM:SS"
- Можно добавить subtle pulse в `field.html` (частота зависит от времени до burn)

### 2. Зеркало присутствия — метафора баланса

**Почему:**
- Не gamification (нет "прогресса к 100%")
- Метафора **равновесия** (центральная точка = нейтральность)
- Визуальная связь с ro.DAG (баланс между in_tree и outside_tree)

**Как перенести:**
- Адаптировать для ro.DAG: горизонтальная шкала с центром
- Левая сторона = outside_tree, правая = in_tree
- Центр = баланс (не "плохо" и не "хорошо")

### 3. Индикаторы как "живые точки"

**Почему:**
- Немедленная визуальная обратная связь
- Ощущение **состояния** (не статичные данные)
- Визуальная связь между действием и результатом

**Как перенести:**
- В `field.html`: узлы как "живые точки" с состояниями
- Цветовая кодировка: in_tree (тёплый), received_um (нейтральный), outside_tree (холодный)
- Пульсация зависит от cycle phase

### 4. Модальное окно — пауза перед действием

**Почему:**
- Создавало **момент рефлексии** (не импульсивное действие)
- Явный выбор получателя (осознанность)
- Финальность действия (подтверждение)

**Как перенести:**
- Сохранить паттерн для критических действий (TRANSFER, BURN)
- Модальное окно с выбором получателя
- Подтверждение перед необратимым действием

---

## Что НЕ переносить

### 1. Триадная система (T1-T5)

**Почему:**
- В 0.4.0 нет триад, есть ro.DAG
- Семантические категории (Знания/Практики) не соответствуют философии 0.4.0
- Цветовая кодировка триад конфликтует с ro.DAG статусами

### 2. Фазы дня (Действие/Тишина/Сон)

**Почему:**
- В 0.4.0 есть cycle phases (8 фаз)
- Дублирование темпоральных систем создаст путаницу
- Фазы дня — это внешний ритм, cycle phases — внутренний

### 3. Backdrop blur в header

**Почему:**
- Противоречит "restrained high-tech"
- Создаёт ощущение "glassmorphism" (запрещено в плане)
- Визуальный шум

### 4. Пульсация О.К. badge

**Почему:**
- Противоречит "тишине"
- Создаёт визуальный шум
- Persistent presence достаточно без анимации

---

## Феноменологическое наблюдение

### Что делало 0.3.22 "живым":

1. **Немедленная обратная связь**
   - Индикаторы загорались/гасли мгновенно
   - Burn timer обновлялся каждую секунду
   - О.К. badge реагировал на эмиссию

2. **Темпоральная граница**
   - Burn timer создавал ощущение "времени до"
   - Фазы дня создавали контекст
   - Статистика "Сегодня" vs "Всего" создавала историю

3. **Визуальная связь между действием и результатом**
   - Выбор триады → подсветка У.Е.
   - Эмиссия → перенос из "Импульс" в "Активные"
   - Передача → У.Е. исчезает из "Активные"

4. **Метафора баланса (не роста)**
   - Зеркало присутствия с центральной точкой
   - Не "прогресс к 100%", а "текущее состояние"
   - Нейтральность как допустимое состояние

### Что потерялось в 0.4.0:

1. **Backend невидим**
   - Нет burn timer
   - Нет визуальной связи с метрономом
   - Нет ощущения "времени до"

2. **Нет немедленной обратной связи**
   - Field.html обновляется только при перезагрузке
   - Нет индикаторов состояния
   - Нет визуальной связи между действием и результатом

3. **Нет метафоры баланса**
   - Нет визуализации ro.DAG как равновесия
   - Нет ощущения "где я нахожусь в поле"

---

## Рекомендации для 0.4.0

### Приоритет 1: Burn Timer в observer.html

**Реализация:**
```javascript
// Обновление каждую секунду
setInterval(() => {
  const now = new Date();
  const nextBurn = new Date();
  nextBurn.setUTCHours(24, 0, 0, 0); // Полночь UTC
  const diff = nextBurn - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  document.getElementById('burn-timer').textContent = 
    `${hours}h ${minutes}m ${seconds}s`;
}, 1000);
```

### Приоритет 2: Зеркало присутствия для ro.DAG

**Реализация:**
- Горизонтальная шкала в field.html
- Левая сторона = outside_tree (холодный оттенок)
- Центр = received_um (нейтральный)
- Правая сторона = in_tree (тёплый оттенок)
- Позиция узла на шкале = его ro.DAG статус

### Приоритет 3: Индикаторы состояния в field.html

**Реализация:**
- Узлы как "живые точки" с цветовой кодировкой
- Пульсация зависит от cycle phase
- Немедленная визуальная обратная связь на изменение состояния

---

## Критерий успеха миграции

0.4.0 будет ощущаться "живым", если:

✅ Backend становится видимым (burn timer, cycle phases)  
✅ Есть немедленная визуальная обратная связь (индикаторы состояния)  
✅ Есть метафора баланса (зеркало ro.DAG)  
✅ Есть темпоральная граница (burn timer, cycle phases)  
✅ Сохранена тишина (нет пульсаций, нет визуального шума)  

---

**Pygmalion / C.R.I.S.T.A.L.L.**  
Числовая НОД-платформа  
© 2017–2026
