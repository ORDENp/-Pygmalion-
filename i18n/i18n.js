// Simple i18n loader for Pygmalion
// Loads translations from JSON files and provides language switching

class I18n {
  constructor() {
    this.currentLang = this.getSavedLang() || 'ru';
    this.translations = {};
  }

  // Get saved language from localStorage
  getSavedLang() {
    try {
      return localStorage.getItem('pygmalion_lang');
    } catch (e) {
      return null;
    }
  }

  // Save language to localStorage
  saveLang(lang) {
    try {
      localStorage.setItem('pygmalion_lang', lang);
    } catch (e) {
      console.warn('Failed to save language preference');
    }
  }

  // Load translation file
  async load(lang) {
    try {
      const response = await fetch(`/i18n/${lang}.json`);
      if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
      this.translations[lang] = await response.json();
      return true;
    } catch (e) {
      console.error(`Failed to load translations for ${lang}:`, e);
      return false;
    }
  }

  // Switch language
  async switchLang(lang) {
    if (!this.translations[lang]) {
      const loaded = await this.load(lang);
      if (!loaded) return false;
    }

    this.currentLang = lang;
    this.saveLang(lang);
    this.updateDOM();
    return true;
  }

  // Get translation by key path (e.g., "landing.title")
  t(keyPath) {
    const keys = keyPath.split('.');
    let value = this.translations[this.currentLang];

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return keyPath; // Return key if translation not found
      }
    }

    return value || keyPath;
  }

  // Update DOM elements with data-i18n attribute
  updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);

      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = translation;
      } else {
        el.textContent = translation;
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // Dispatch event for custom handlers
    window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: this.currentLang } }));
  }

  // Initialize i18n system
  async init() {
    await this.load(this.currentLang);
    this.updateDOM();

    // Setup language switcher links
    document.querySelectorAll('[data-lang]').forEach(link => {
      link.classList.toggle('active', link.dataset.lang === this.currentLang);

      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const lang = link.dataset.lang;
        const success = await this.switchLang(lang);

        if (success) {
          document.querySelectorAll('[data-lang]').forEach(l => {
            l.classList.toggle('active', l.dataset.lang === lang);
          });
        }
      });
    });
  }
}

// Export for use in HTML
window.i18n = new I18n();
