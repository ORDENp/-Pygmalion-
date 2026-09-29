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

### 5. Фазы дня (Действие/Тишина/Сон)

**Реализация в 0.3.26.05:**

**HTML (index.html, строки 144-151):**
```html
<div class="phase-indicator-bar">
  <div class="phase-info-row">
    <span class="phase-icon" id="phase-icon">🌞</span>
    <span class="phase-name" id="phase-name" data-i18n="phase_action">Действие</span>
    <span class="phase-desc" id="phase-desc">04:00 – 19:55</span>
  </div>
</div>
```

**JavaScript (timeRhythm.js, строки 28-37):**
```javascript
function getSystemPhase(nowMs) {
  const d = new Date(nowMs);
  const ms = d.getHours() * 3600000 + d.getMinutes() * 60000
           + d.getSeconds() * 1000    + d.getMilliseconds();

  if (ms >= RHYTHM.T0400 && ms < RHYTHM.T1955) return 'active';   // 04:00-19:55
  if (ms >= RHYTHM.T1955 && ms < RHYTHM.T2000) return 'silence';  // 19:55-20:00
  return 'impulse'; // 20:00-03:59 (сон)
}
```

**Что ощущалось живым:**
- **Индикатор фазы между Актом 1 и Актом 2** — визуальный разделитель
- **Иконка + название + временной диапазон** — полный контекст
- **Три фазы**: Действие (🌞 04:00-19:55), Тишина (🌙 19:55-20:00), Сон (💤 20:00-04:00)
- **Автоматическое обновление** — фаза менялась в реальном времени

**Почему это давало чувство поля:**
- **Темпоральный контекст** — не абстрактное время, а фазы с семантикой
- **Визуальная метафора** (иконки создавали атмосферу)
- **Ритм системы** — не человек управляет временем, а время управляет системой

---

## Карта переноса

| Элемент | Ценность | Переносить? | Как адаптировать |
|---------|----------|-------------|------------------|
| **Burn Timer** | Критическая — создавал темпоральную границу | ✅ Да | Добавить в observer.html как "Next burn in: HH:MM:SS" |
| **УЕ Indicators (визуальные точки)** | Высокая — немедленная обратная связь | ⚠️ Частично | Адаптировать для ro.DAG: узлы в field.html как "живые точки" с состояниями |
| **Зеркало присутствия (Spiritual Scale)** | Высокая — метафора баланса, не роста | ✅ Да | Адаптировать для ro.DAG: визуализация in_tree / outside_tree как баланс |
| **О.К. Badge с пульсацией** | Средняя — persistent presence | ⚠️ Частично | Упростить: persistent О.К. в header без пульсации (тишина) |
| **Фазы дня (Действие/Тишина/Сон)** | Средняя — темпоральный контекст | ❌ Нет | В 0.4.0 есть cycle phases (8 фаз). Не дублировать. |
| **Триадная система (T1-T5)** | Высокая в 0.3.26, но несовместима | ❌ Нет | В 0.4.0 нет триад, есть ro.DAG. Не переносить. |
| **Цветовая кодировка триад** | Высокая — визуальная связь | ⚠️ Частично | Адаптировать: цветовая кодировка для ro.DAG статусов (in_tree/received_um/outside_tree) |

---

## Ключевые находки для 0.4.0

### 1. Burn Timer — критический элемент

**Почему:**
- Создавал **темпоральную границу** (не абстрактное "в полночь", а конкретный countdown)
- Ощущение **ритма системы** (система дышит сама)
- **Обратная связь** на метроном (backend становится видимым)

**Как перенести:**
- Добавить в `observer.html` как "Next burn in: HH:MM:SS"
- Обновление каждую секунду через JavaScript setInterval
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

---

## Феноменологическое наблюдение

### Что делало 0.3.26.05 "живым":

1. **Немедленная обратная связь**
   - Индикаторы загорались/гасли мгновенно
   - Burn timer обновлялся каждую секунду
   - О.К. badge реагировал на эмиссию

2. **Темпоральная граница**
   - Burn timer создавал ощущение "времени до"
   - Фазы дня создавали контекст
   - Автоматическое обновление состояний

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

## Критерий успеха миграции

0.4.0 будет ощущаться "живым", если:

✅ Backend становится видимым (burn timer в observer.html)  
✅ Есть немедленная визуальная обратная связь (индикаторы состояния в field.html)  
✅ Есть метафора баланса (зеркало ro.DAG)  
✅ Есть темпоральная граница (burn timer, cycle phases)  
✅ Сохранена тишина (нет пульсаций О.К. badge, нет визуального шума)  

---

**Pygmalion / C.R.I.S.T.A.L.L.**  
Числовая НОД-платформа  
© 2017–2026
