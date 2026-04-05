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
 
   const I18N_BASE_CANDIDATES = [
     'assets/i18n',
     '../assets/i18n',
     '/assets/i18n',
     '/-Pygmalion-/assets/i18n'
   ];

   function updateLangButtons() {
     document.querySelectorAll('.lang-btn').forEach(btn => {
       btn.classList.toggle('active', btn.dataset.setLang === I18N.lang);
     });
   }

   async function loadFromCandidates(lang) {
     for (const base of I18N_BASE_CANDIDATES) {
       const url = `${base}/${lang}.json`;
       try {
         const resp = await fetch(url, { cache: 'no-store' });
         if (!resp.ok) continue;

         const data = await resp.json();
         return { data, url };
       } catch (e) {
         // Игнорируем и пробуем следующий путь
       }
     }

     throw new Error(
       `i18n ${lang}.json не найден. Проверены пути: ${I18N_BASE_CANDIDATES.join(', ')}`
     );
   }

   /**
    * Загрузка локализации
    * @param {string} lang - 'ru' или 'en'
    */
   async function load(lang) {
     I18N.lang = lang;
     updateLangButtons();

     try {
       const { data, url } = await loadFromCandidates(lang);
       I18N.strings = data;
       I18N.loaded = true;
       apply();

       console.log(`[i18n] Язык загружен: ${lang} (${url})`);
     } catch (e) {
       console.warn(`[i18n] Ошибка загрузки ${lang}: ${e.message}. Использую пустой словарь.`);
       I18N.strings = {};
       I18N.loaded = false;
       updateLangButtons();

       if (window.location.protocol === 'file:') {
         console.warn('[i18n] Запуск через file:// может блокировать fetch(). Запустите через локальный HTTP-сервер.');
       }
     }
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
 

     updateLangButtons();
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
    * Инициализация: подхват сохранённого языка + навешивание кнопок
    */
   function init() {
     const savedLang = localStorage.getItem('pygmalion_i18n_lang') || 'ru';
 
     // Привязка к кнопкам RU/EN
     document.querySelectorAll('.lang-btn').forEach(btn => {
       btn.addEventListener('click', () => {
         setLang(btn.dataset.setLang);
