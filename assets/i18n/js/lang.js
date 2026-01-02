let translations = {};
let currentLang = localStorage.getItem('lang') || 'en';

async function loadLanguage(lang) {
  const response = await fetch(`/assets/i18n/${lang}.json`);
  translations = await response.json();

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const keys = el.dataset.i18n.split('.');
    let value = translations;
    keys.forEach(k => value = value?.[k]);
    if (value) el.textContent = value;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadLanguage(currentLang);

  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.setLang;
      localStorage.setItem('lang', currentLang);
      loadLanguage(currentLang);
    });
  });
});
