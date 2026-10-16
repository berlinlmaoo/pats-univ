import { en } from './en';
import { id } from './id';
import { DEFAULT_LOCALE, LOCALES, type DictionaryShape, type LeafPaths, type Locale } from './types';

export { en, id };
export * from './types';

export type Dictionary = DictionaryShape<typeof en>;
export type MessageKey = LeafPaths<typeof en>;
export type MessageParams = Record<string, string | number>;

export const dictionaries: Record<Locale, Dictionary> = { en, id };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Picks the first supported locale from an Accept-Language header or device list. */
export function matchLocale(candidates: readonly string[] | string | null | undefined): Locale {
  const list = typeof candidates === 'string'
    ? candidates.split(',').map((part) => part.split(';')[0]!.trim())
    : candidates ?? [];
  for (const tag of list) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
    if (base === 'in' || base === 'ms') return 'id';
  }
  return DEFAULT_LOCALE;
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

/** Translate `key`, filling `{placeholders}`. Falls back to English, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return translateLoose(locale, key, params);
}

/** Same as `translate` for keys only known at runtime (e.g. validation keys from the API). */
export function translateLoose(locale: Locale, key: string, params?: MessageParams): string {
  const template = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export interface Translator {
  (key: MessageKey, params?: MessageParams): string;
  /** For keys only known at runtime. */
  loose: (key: string, params?: MessageParams) => string;
  locale: Locale;
}

export function createTranslator(locale: Locale): Translator {
  const t = ((key: MessageKey, params?: MessageParams) => translate(locale, key, params)) as Translator;
  t.loose = (key, params) => translateLoose(locale, key, params);
  t.locale = locale;
  return t;
}
