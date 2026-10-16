'use client';

import { createTranslator, type Locale, type Translator } from '@pats/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT() outside <I18nProvider>');
  return t;
}
