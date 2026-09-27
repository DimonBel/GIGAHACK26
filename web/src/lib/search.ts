/** Accent- and case-insensitive text search, folded like Mantine's Highlight. */

/** Lower case without diacritics, so "sedinta" finds "ședința". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesQuery(text: string, query: string): boolean {
  const needle = foldText(query.trim());
  return !needle || foldText(text).includes(needle);
}
