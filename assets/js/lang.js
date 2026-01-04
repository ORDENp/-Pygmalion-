// /assets/js/lang.js - Исправленная версия
(function () {
    'use strict';

    let currentLang = localStorage.getItem('preferredLang') || 'ru';
    const langToggleButtons = document.querySelectorAll('[data-set-lang]');

    // Функция загрузки JSON файла с переводом
    async function loadLanguageFile(lang) {
        try {
            // Используем абсолютный путь от корня сайта
            const response = await fetch(`/assets/i18n/${lang}.json`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Failed to load language file for "${lang}":`, error);
            // Возвращаем пустой объект, если загрузка не удалась
            return {};
        }
    }

    // Основная функция применения перевода
    async function applyTranslations(lang) {
        const translations = await loadLanguageFile(lang);
        const elements = document.querySelectorAll('[data-i18n]');

        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (translations[key]) {
                // Обновляем textContent для текста и placeholder для input/textarea
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    const placeholderKey = element.getAttribute('data-i18n-placeholder');
                    if (placeholderKey && translations[placeholderKey]) {
                        element.placeholder = translations[placeholderKey];
                    }
                } else {
                    element.textContent = translations[key];
                }
            }
        });

        // Обновляем активную кнопку выбора языка
        langToggleButtons.forEach(btn => {
            if (btn.getAttribute('data-set-lang') === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        currentLang = lang;
        localStorage.setItem('preferredLang', lang);
        document.documentElement.lang = lang; // Для семантики и доступности
    }

    // Инициализация: ждём готовности DOM
    document.addEventListener('DOMContentLoaded', function () {
        // Назначаем обработчики кнопкам смены языка
        langToggleButtons.forEach(button => {
            button.addEventListener('click', function (e) {
                e.preventDefault();
                const newLang = this.getAttribute('data-set-lang');
                if (newLang !== currentLang) {
                    applyTranslations(newLang);
                }
            });
        });

        // Применяем язык по умолчанию при первой загрузке
        applyTranslations(currentLang);
    });
})();
