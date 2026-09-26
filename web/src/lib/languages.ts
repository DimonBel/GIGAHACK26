/** Spoken languages of the transcript. */
import type { MantineColor } from '@mantine/core';

export const LANGUAGES: Record<string, { label: string; color: MantineColor }> = {
  ro: { label: 'Romanian', color: 'blue' },
  ru: { label: 'Russian', color: 'red' },
  en: { label: 'English', color: 'green' },
};

export function languageLabel(code: string): string {
  return LANGUAGES[code]?.label ?? code.toUpperCase();
}
