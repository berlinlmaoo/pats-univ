'use server';

import { isLocale, type Locale } from '@pats/shared';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE } from '@/lib/i18n';

export async function setLocaleAction(locale: Locale) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
}
