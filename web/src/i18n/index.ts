/** The app in Romanian, Russian or English (i18next). The choice is kept in this browser; the first visit follows
 *  the browser's language, else Romanian. Everything is bundled: nothing is loaded from the network. */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './resources';

export const LANGUAGES = [
  { value: 'ro', label: 'RO', name: 'Română', locale: 'ro-RO' },
  { value: 'ru', label: 'RU', name: 'Русский', locale: 'ru-RU' },
  { value: 'en', label: 'EN', name: 'English', locale: 'en-GB' },
] as const;

export type Language = (typeof LANGUAGES)[number]['value'];

const STORAGE_KEY = 'smom.language';
const DEFAULT_LANGUAGE: Language = 'ro';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.value === value);
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage is blocked: the browser's language is used.
  }
  const browser = navigator.language.slice(0, 2).toLowerCase();
  return isLanguage(browser) ? browser : DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(resources.en),
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes what it renders
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not kept for the next visit; this one still changes.
  }
  void i18n.changeLanguage(language);
}

/** The Intl locale of the app's language, for dates and numbers. */
export function locale(): string {
  return LANGUAGES.find((language) => language.value === currentLanguage())?.locale ?? 'en-GB';
}

export default i18n;
