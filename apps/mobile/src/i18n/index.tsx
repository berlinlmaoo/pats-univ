import { createTranslator, isLocale, matchLocale, type Locale, type Translator } from '@pats/shared';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';

const KEY = 'pats.locale';

interface I18n {
  t: Translator;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

function deviceLocale(): Locale {
  return matchLocale(getLocales().map((l) => l.languageTag));
}

/** UI language: the member's choice if any, else the device language (Indonesian fallback). */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    void storage.get(KEY).then((saved) => {
      if (isLocale(saved)) setLocaleState(saved);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void storage.set(KEY, next);
  }, []);

  const value = useMemo(() => ({ t: createTranslator(locale), locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n() outside <I18nProvider>');
  return ctx;
}

export const useT = () => useI18n().t;
