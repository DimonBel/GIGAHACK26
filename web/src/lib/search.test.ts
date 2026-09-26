import { describe, expect, it } from 'vitest';

import { foldText, matchesQuery } from './search';

describe('transcript search', () => {
  it('ignores Romanian diacritics and case', () => {
    expect(foldText('Ședința Țării')).toBe('sedinta tarii');
    expect(matchesQuery('Începem ședința de azi', 'SEDINTA')).toBe(true);
    expect(matchesQuery('Pacientul din patul 8', 'patul 9')).toBe(false);
  });

  it('finds Cyrillic words and matches everything for an empty query', () => {
    expect(matchesQuery('Хорошо, давайте посмотрим', 'давайте')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });
});
