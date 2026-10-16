import 'server-only';
import { createTranslator, isLocale, matchLocale, type Locale, type Translator } from '@pats/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

export const LOCALE_COOKIE = 'pats_locale';

/** UI language: explicit choice (cookie) first, then the browser's Accept-Language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchLocale((await headers()).get('accept-language'));
});

export const getT = cache(async (): Promise<Translator> => createTranslator(await getLocale()));
