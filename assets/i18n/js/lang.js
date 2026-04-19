/**
 * CANONICAL i18n ENGINE (Pygmalion)
 * Единая точка правды для всех страниц.
 * Управляет языком через localStorage и data-атрибуты.
 */
(function() { 
    'use strict';
  
    const CONFIG = { 
      defaultLang: 'ru', 
      supportedLangs: ['ru', 'en'],
      storageKey: 'pygmalion_lang' 
    };
  
    // 1. Определяем текущий язык (URL > LocalStorage > Default)
    function getCurrentLang() { 
      const urlParams = new URLSearchParams(window.location.search); 
      const urlLang = urlParams.get('lang');
      
      if (urlLang && CONFIG.supportedLangs.includes(urlLang)) {
        localStorage.setItem(CONFIG.storageKey, urlLang);
        return urlLang;
      }
      
      const storedLang = localStorage.getItem(CONFIG.storageKey);
      if (storedLang && CONFIG.supportedLangs.includes(storedLang)) {
        return storedLang;
      }
      
      return CONFIG.defaultLang;
    }
  
    // 2. Определяем путь к JSON (учитываем вложенность папок)
    function getI18nPath() { 
      const depth = (window.location.pathname.match(/\//g) || []).length; 
      // Если мы в корне (depth 1), путь assets/i18n/
      // Если мы в /support/ (depth 2), путь ../assets/i18n/
      const prefix = depth > 1 ? '../'.repeat(depth - 1) : '';
      return `${prefix}assets/i18n/`; 
    }
  
    // 3. Загрузка JSON файла
    async function loadTranslations(lang) { 
      try { 
        const path = getI18nPath(); 
        // ВАЖНО: Убедитесь, что файлы ru.json и en.json лежат в assets/i18n/
        const response = await fetch(`${path}${lang}.json`);
        
        if (!response.ok) {
          console.warn(`[i18n] Не удалось загрузить ${lang}.json`);
          return null;
        }
        return await response.json();
      } catch (error) {
        console.error('[i18n] Ошибка загрузки:', error);
        return null;
      }
    }
  
    // 4. Применение текстов на странице
    function applyTranslations(translations) { 
      if (!translations) return;
      
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translations[key];
          } else {
            // Используем innerHTML для поддержки переносов строк, если нужно, или textContent для безопасности
            el.textContent = translations[key]; 
          }
        }
      });
    }
  
    // 5. Подсветка активной кнопки языка
    function updateButtons(currentLang) {
      document.querySelectorAll('[data-set-lang]').forEach(btn => { 
        const btnLang = btn.getAttribute('data-set-lang'); 
        if (btnLang === currentLang) {
          btn.classList.add('active'); 
          btn.style.opacity = '1';
          btn.style.textDecoration = 'underline';
        } else {
          btn.classList.remove('active'); 
          btn.style.opacity = '0.5';
          btn.style.textDecoration = 'none';
        } 
      }); 
    }
  
    // 6. Главная функция переключения
    function switchLanguage(lang) { 
      if (!CONFIG.supportedLangs.includes(lang)) return;
      
      localStorage.setItem(CONFIG.storageKey, lang);
      
      loadTranslations(lang).then(translations => {
        if (translations) {
          applyTranslations(translations);
          updateButtons(lang);
        }
      });
    }
  
    // 7. Инициализация при загрузке
    function init() { 
      const currentLang = getCurrentLang();
      loadTranslations(currentLang).then(translations => {
        if (translations) {
          applyTranslations(translations);
          updateButtons(currentLang);
        }
      });
      
      // Навешиваем клики на кнопки
      document.querySelectorAll('[data-set-lang]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const lang = btn.getAttribute('data-set-lang');
          switchLanguage(lang);
        });
      });
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init); 
    } else { 
      init(); 
    }
  
  })();
