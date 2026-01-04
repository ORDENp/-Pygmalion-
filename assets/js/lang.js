/**
 * Simple i18n engine for GitHub Pages
 * Handles relative paths and nested JSON keys
 */

const VALID_LANGS = ['ru', 'en'];
const DEFAULT_LANG = 'ru';

// 1. Определяем язык (из URL ?lang=, localStorage или браузера)
function getLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lang') && VALID_LANGS.includes(urlParams.get('lang'))) {
        return urlParams.get('lang');
    }
    const saved = localStorage.getItem('selectedLang');
    if (saved && VALID_LANGS.includes(saved)) {
        return saved;
    }
    const browser = navigator.language.slice(0, 2);
    return VALID_LANGS.includes(browser) ? browser : DEFAULT_LANG;
}

// 2. Функция применения переводов
function applyTranslations(translations) {
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        
        // Поддержка вложенных ключей (например, "hero.title")
        const text = key.split('.').reduce((obj, i) => (obj ? obj[i] : null), translations);

        if (text) {
            // Если это input/placeholder, меняем атрибут, иначе текст
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else {
                el.innerHTML = text; // innerHTML разрешает простые теги вроде <br>
            }
        } else {
            console.warn(`Missing translation for key: ${key}`);
        }
    });
    
    // Обновляем атрибут lang у html для CSS и a11y
    document.documentElement.lang = localStorage.getItem('selectedLang') || DEFAULT_LANG;
}

// 3. Загрузка JSON файла
async function loadLanguage(lang) {
    // ВАЖНО: Используем точку в начале для относительного пути на GitHub Pages
    const path = `./assets/i18n/${lang}.json`; 
    
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const translations = await response.json();
        
        // Сохраняем и применяем
        localStorage.setItem('selectedLang', lang);
        applyTranslations(translations);
        
        // Обновляем активные кнопки (если есть)
        updateActiveButtons(lang);
        
    } catch (error) {
        console.error('Error loading translation:', error);
        // Фолбек на дефолтный язык, если запрошенный не найден
        if (lang !== DEFAULT_LANG) loadLanguage(DEFAULT_LANG);
    }
}

// Хелпер для кнопок переключения
function updateActiveButtons(lang) {
    document.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-set-lang') === lang);
    });
}

// 4. Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const currentLang = getLanguage();
    loadLanguage(currentLang);

    // Навешиваем слушатели на кнопки переключения языков
    document.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Предотвращаем переход, если это ссылка
            const newLang = btn.getAttribute('data-set-lang');
            loadLanguage(newLang);
        });
    });
});
```

### 5. Инструкция по внедрению

1.  **Проверьте HTML (`index.html`):**
    Убедитесь, что скрипт подключен **перед** закрывающим тегом `</body>` или в `<head>` с атрибутом `defer`:
    ```html
    <script src="./assets/js/lang.js" defer></script>
    ```
    *Обратите внимание на точку `.` перед `/assets`.*

2.  **Проверьте JSON файлы:**
    Убедитесь, что ключи в `ru.json` совпадают с тем, что написано в `data-i18n`.
    *Пример:*
    HTML: `<h1 data-i18n="main.title"></h1>`
    JSON: 
    ```json
    {
      "main": {
        "title": "Привет, мир!"
      }
    }
    ```
    Или плоский JSON:
    ```json
    {
      "main.title": "Привет, мир!"
    }
