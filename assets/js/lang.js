// assets/js/lang.js
let translations = {};
let currentLang = localStorage.getItem('lang') || 'en';

async function loadLanguage(lang) {
  try {
    // Используем относительный путь. Предполагается, что index.html или support/index.html
    // находятся в корне репозитория или на таком уровне, где ../assets/ доступен.
    // Если `support/index.html` находится в подкаталоге, относительный путь нужно скорректировать.
    // Например, если файл `support/index.html`, путь '../assets/i18n/' будет правильным.
    // Если файл `some/deep/path/index.html`, путь будет '../../assets/i18n/' и т.д.
    const response = await fetch(`../assets/i18n/${lang}.json`);
    // Если структура такова, что `support/index.html` в подкаталоге, и `assets` в корне репо,
    // можно использовать относительный путь от корня репо, но это сложнее управлять.
    // Проще всего, если `index.html` (основной) и `assets/` находятся в корне репо.
    // Или положить lang.js рядом с JSON и использовать './en.json' оттуда.
    // Но в текущей структуре, если `support/index.html` в подкаталоге `support/`:
    // const response = await fetch(`../assets/i18n/${lang}.json`);

    // Для случая, если `index.html` и `support/index.html` находятся в корне репо:
    // const response = await fetch(`./assets/i18n/${lang}.json`);

    // Для случая, если `support/index.html` находится в подкаталоге `support/`:
    const response = await fetch(`../assets/i18n/${lang}.json`);


    if (!response.ok) {
      throw new Error(`Failed to load ${lang}.json: ${response.status}`);
    }
    translations = await response.json();
    applyTranslations(); // Вызываем функцию обновления DOM после загрузки
  } catch (error) {
    console.error('Error loading language:', error);
    // Можно добавить отображение ошибки пользователю
  }
}

function applyTranslations() {
  // Проходим по всем элементам с атрибутом data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n; // Например, "hero.title"
    // Разбиваем ключ на части
    const keys = key.split('.');
    let value = translations;
    // Проходим по вложенным объектам
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Если путь недействителен, value станет undefined
        value = undefined;
        break;
      }
    }
    // Если значение найдено, обновляем текст элемента
    if (value !== undefined) {
      el.textContent = value;
    } else {
      // Опционально: пометить ненайденные ключи для отладки
      console.warn(`Translation key not found: ${key} for language ${currentLang}`);
      // Или оставить placeholder
      // el.textContent = `[${key}]`;
    }
  });
}


document.addEventListener('DOMContentLoaded', () => {
  // Инициализируем язык при загрузке DOM
  loadLanguage(currentLang);

  // Обработчики для кнопок переключения языка
  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.setLang;
      localStorage.setItem('lang', currentLang); // Сохраняем выбор
      loadLanguage(currentLang); // Загружаем и применяем новый язык
    });
  });
});
