let translations = {};
let currentLang = localStorage.getItem('lang') || 'en';

async function loadJSON(lang) {
  const response = await fetch(`./assets/i18n/${lang}.json`);
  return response.json();
}

async function loadTranslations() {
  translations[currentLang] = await loadJSON(currentLang);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const keys = el.dataset.i18n.split('.');
    let value = translations[currentLang];
    keys.forEach(k => value = value?.[k]);
    if (value) el.textContent = value;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentLang = btn.dataset.setLang;
      localStorage.setItem('lang', currentLang);
      await loadTranslations();
    });
  });

  loadTranslations();
});
