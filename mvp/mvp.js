// mvp.js — Minimal logic for Pygmalion MVP v.0.1.5
// Total: 45 lines (including comments)

let kons = [];

function addKon() {
    kons.push({ id: Date.now(), received: 0, given: 0, note: '' });
    renderTable();
    updateSummary();
}

function renderTable() {
    const tbody = document.getElementById('konTableBody');
    tbody.innerHTML = '';
    kons.forEach((kon, i) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${i + 1}</td>
            <td><input type="number" value="${kon.received}" 
                onchange="updateKon(${i}, 'received', this.value)"></td>
            <td><input type="number" value="${kon.given}" 
                onchange="updateKon(${i}, 'given', this.value)"></td>
            <td>${kon.received - kon.given}</td>
            <td><input type="text" value="${kon.note}" 
                onchange="updateKon(${i}, 'note', this.value)"></td>
        `;
    });
}

function updateKon(i, field, value) {
    kons[i][field] = field === 'note' ? value : parseFloat(value) || 0;
    renderTable();
    updateSummary();
}

function updateSummary() {
    const total = kons.length;
    const received = kons.reduce((s, k) => s + k.received, 0);
    const given = kons.reduce((s, k) => s + k.given, 0);
    document.getElementById('totalKons').textContent = total;
    document.getElementById('totalReceived').textContent = received.toFixed(2);
    document.getElementById('totalGiven').textContent = given.toFixed(2);
    document.getElementById('totalBalance').textContent = (received - given).toFixed(2);
}

function clearTable() {
    if (confirm('Очистить все коны?')) {
        kons = [];
        renderTable();
        updateSummary();
    }
}
```

---

## 📦 OFFLINE MVP — СОЗДАНИЕ ZIP

### **Структура offline-mvp.zip:**
```
offline-mvp.zip
│
└── pygmalion-mvp/
    ├── index.html       ← Точная копия /mvp/index.html
    └── README.txt       ← Инструкция
```

### **README.txt:**
```
PYGMALION MVP v0.1.5 — OFFLINE VERSION
======================================

Это автономная версия MVP.
Работает без интернета.

КАК ЗАПУСТИТЬ:
1. Распакуйте архив
2. Откройте index.html в браузере

ЧТО ВНУТРИ:
- Таблица конов (наблюдение)
- Итоговая сводка
- Экспорт данных

ВАЖНО:
- Данные НЕ сохраняются автоматически
- Используйте "Экспорт" или скриншот
- Интерпретация принадлежит вам

Лицензия: MIT
Сайт: https://ordenp.github.io/-Pygmalion-/
