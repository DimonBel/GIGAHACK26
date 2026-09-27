/** A translation of an English namespace: every English key, plus the plural forms (_few, _many) the language
 *  needs; any other key is a typo. */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> } & {
  [plural: `${string}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}`]: string;
};
