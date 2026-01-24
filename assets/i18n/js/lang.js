// Типичная реализация
(function() {
  let currentLang = localStorage.getItem('lang') || 'ru';
  
  function loadTranslations(lang) {
    fetch(`../assets/i18n/${lang}.json`)
      .then(r => r.json())
      .then(translations => applyTranslations(translations));
  }
  
  function applyTranslations(translations) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[key]) el.textContent = translations[key];
    });
  }
  
  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lang = e.target.getAttribute('data-set-lang');
      localStorage.setItem('lang', lang);
      loadTranslations(lang);
    });
  });
  
  loadTranslations(currentLang);
})();
