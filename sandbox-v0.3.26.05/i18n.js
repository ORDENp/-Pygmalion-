/**
 * @file i18n.js — Билингво (RU/EN) для Pygmalion v0.3.22
 * Загрузка и применение локализации из assets/i18n/{lang}.json
 */

(function(global) {
  'use strict';

  const I18N = {
    lang: 'ru',
    strings: {},
    loaded: false
  };

  /**
   * Загрузка локализации
   * @param {string} lang - 'ru' или 'en'
   */
  async function load(lang) {
    I18N.lang = lang;

    // Пробуем относительный путь (локально), затем абсолютный (GitHub Pages)
    const paths = [
      `assets/i18n/${lang}.json`,               // локально: из корня песочницы
      `https://raw.githubusercontent.com/ORDENp/-Pygmalion-/1/assets/i18n/${lang}.json`,  // GitHub Pages (ветка 1)
    ];

    for (const path of paths) {
      try {
        const resp = await fetch(path);
        if (!resp.ok) continue;
        I18N.strings = await resp.json();
        I18N.loaded = true;
        apply();
        console.log(`[i18n] Язык загружен: ${lang} (${path})`);
        return;
      } catch (e) {
        // Пробуем следующий путь
      }
    }

    // Все пути не сработали
    console.warn(`[i18n] Не удалось загрузить ${lang}.json ни из одного источника.`);
    I18N.strings = {};
    I18N.loaded = false;
  }

  /**
   * Применение загруженных строк к DOM
   * — [data-i18n] → textContent
   * — [data-i18n-html] → innerHTML (для <br> и т.д.)
   * — [data-i18n-placeholder] → placeholder
   * — [data-i18n-title] → title
   */
  function apply() {
    if (!I18N.loaded) return;

    // TextContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (I18N.strings[key] !== undefined) {
        el.textContent = I18N.strings[key];
      }
    });

    // InnerHTML (для элементов с <br> и др. HTML)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (I18N.strings[key] !== undefined) {
        el.innerHTML = I18N.strings[key];
      }
    });

    // Placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (I18N.strings[key] !== undefined) {
        el.placeholder = I18N.strings[key];
      }
    });

    // Title (tooltip)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (I18N.strings[key] !== undefined) {
        el.title = I18N.strings[key];
      }
    });

    // Обновляем активные кнопки языка
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.setLang === I18N.lang);
    });
  }

  /**
   * Переключение языка (вызывается из UI)
   * @param {string} lang - 'ru' или 'en'
   */
  function setLang(lang) {
    if (lang === I18N.lang && I18N.loaded) {
      apply();
      return;
    }
    localStorage.setItem('pygmalion_i18n_lang', lang);
    load(lang);
  }

  /**
   * Получить стро по ключу (для использования из JS)
   * @param {string} key - ключ из JSON
   * @param {Object} [params] - подстановки {min, max} и т.д.
   * @returns {string}
   */
  function t(key, params) {
    let str = I18N.strings[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, v);
      });
    }
    return str;
  }

  /**
   * Инициализация: подхват сохранённого языка + навешивание кнопок
   */
  function init() {
    const savedLang = localStorage.getItem('pygmalion_i18n_lang') || 'ru';

    // Привязка к кнопкам RU/EN
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.setLang);
      });
    });

    // Загрузка сохранённого языка
    load(savedLang);
  }

  // Экспорт
  global.I18N = { load, apply, setLang, init, t, get strings() { return I18N.strings; } };

  // Авто-инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
