import { describe, expect, it } from 'vitest';

import { resources } from './resources';

type Tree = { [key: string]: string | Tree };

const PLURAL = /_(zero|one|two|few|many|other)$/;
/** The plural forms each language picks from (Intl.PluralRules for whole numbers). */
const FORMS = { en: ['one', 'other'], ro: ['one', 'few', 'other'], ru: ['one', 'few', 'many', 'other'] } as const;

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
  );
}

const keysOf = (language: keyof typeof resources) =>
  Object.entries(resources[language]).flatMap(([namespace, tree]) =>
    flatten(tree as Tree).map((key) => `${namespace}:${key}`),
  );

describe('translations', () => {
  it('have every plural form their language uses, so no count falls back to English', () => {
    const plurals = new Set(
      keysOf('en')
        .filter((key) => PLURAL.test(key))
        .map((key) => key.replace(PLURAL, '')),
    );
    for (const language of ['ro', 'ru'] as const) {
      const keys = new Set(keysOf(language));
      const missing = [...plurals].flatMap((base) =>
        FORMS[language].filter((form) => !keys.has(`${base}_${form}`)).map((form) => `${base}_${form}`),
      );
      expect(missing, language).toEqual([]);
    }
  });

  it('say the same things in every language: no key only in one of them', () => {
    const bases = (language: keyof typeof resources) => new Set(keysOf(language).map((key) => key.replace(PLURAL, '')));
    const english = bases('en');
    for (const language of ['ro', 'ru'] as const) {
      expect(
        [...bases(language)].filter((key) => !english.has(key)),
        language,
      ).toEqual([]);
      expect(
        [...english].filter((key) => !bases(language).has(key)),
        language,
      ).toEqual([]);
    }
  });
});
