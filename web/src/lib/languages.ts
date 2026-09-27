/** Spoken languages of the transcript, and the languages the minutes can be written in. */
import type { MantineColor } from '@mantine/core';

import type { MinutesLanguage } from '../api/types';
import i18n from '../i18n';

export const LANGUAGE_COLORS: Record<string, MantineColor> = { ro: 'blue', ru: 'red', en: 'green' };

/** Each named in its own language, as on medpark.md. */
export const MINUTES_LANGUAGES: { value: MinutesLanguage; label: string }[] = [
  { value: 'ro', label: 'Română' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

export function isMinutesLanguage(code: string): code is MinutesLanguage {
  return MINUTES_LANGUAGES.some((language) => language.value === code);
}

/** "Romanian" for "ro", in the app's language; an unknown code as it is. */
export function languageLabel(code: string): string {
  return code in LANGUAGE_COLORS ? i18n.t(`spokenLanguage.${code as MinutesLanguage}`) : code.toUpperCase();
}
