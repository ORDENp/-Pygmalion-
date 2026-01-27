const LANG_KEY = 'lang';
const DEFAULT_LANG = 'ru';

function getLang() {
  return localStorage.getItem(LANG_KEY) || DEFAULT_LANG;
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  loadLang(lang);
}

async function loadLang(lang) {
  const res = await fetch(`/-Pygmalion-/assets/i18n/${lang}.json`);
  const dict = await res.json();

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.setLang === lang);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadLang(getLang());

  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.onclick = () => setLang(btn.dataset.setLang);
  });
});
