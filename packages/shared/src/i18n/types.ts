export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'id';

/** Same shape as the English dictionary, with every leaf widened to string. */
export type DictionaryShape<T> = { [K in keyof T]: T[K] extends string ? string : DictionaryShape<T[K]> };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
/** Dot-paths to every string leaf, e.g. "join.title". */
export type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, LeafPaths<T[K]>>;
}[keyof T & string];
