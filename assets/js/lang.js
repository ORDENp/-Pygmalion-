console.log('lang.js loaded');

const VALID_LANGS = ['ru', 'en'];
const DEFAULT_LANG = 'en';

/**
 * Определяем корень репозитория GitHub Pages
 * https://username.github.io/repo-name/...
 */
function getRepoRoot() {
  const parts = window.location.pathname.split('/');
  // ["", "-Pygmalion-", "C.R.I.S.T.A.L.L", ""]
  return '/' + parts[1] + '/';
}

const REPO_ROOT = getRepoRoot(); // "/-Pygmalion-/"

function getLanguage() {
  const saved = localStorage.getItem('selectedLang');
  if (saved && VALID_LANGS.includes(saved)) return saved;

  const browser = navigator.language.slice(0, 2);
  return VALID_LANGS.includes(browser) ? browser : DEFAULT_LANG;
}

async function loadLanguage(lang) {
  const url = `${REPO_ROOT}assets/i18n/${lang}.json`;
  console.log('[i18n] loading:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const translations = await res.json();

    localStorage.setItem('selectedLang', lang);
    applyTranslations(translations);
    updateActiveButtons(lang);

  } catch (e) {
    console.error('[i18n] load failed', e);
  }
}

function applyTranslations(translations) {
  const nodes = document.querySelectorAll('[data-i18n]');
  console.log('[i18n] nodes found:', nodes.length);

  nodes.forEach(el => {
    const key = el.dataset.i18n;
    const text = key.split('.').reduce((o, k) => o?.[k], translations);
    if (text) el.innerHTML = text;
  });

  document.documentElement.lang = localStorage.getItem('selectedLang') || DEFAULT_LANG;
}

function updateActiveButtons(lang) {
  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.setLang === lang);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const lang = getLanguage();
  loadLanguage(lang);

  document.querySelectorAll('[data-set-lang]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      loadLanguage(btn.dataset.setLang);
    });
  });
});
