'use client';

import { NextIntlClientProvider } from 'next-intl';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { localeCookieName, resolveLocale } from './config';
import type { Locale } from './config';
import { getMessages } from './messages';

interface LocaleContextValue {
  locale: Locale;
  switchLocale: (nextLocale: Locale) => void;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const oneYearSeconds = 60 * 60 * 24 * 365;

function persistLocale(locale: Locale) {
  document.cookie = `${localeCookieName}=${locale}; Path=/; Max-Age=${oneYearSeconds}; SameSite=Lax`;
  window.localStorage.setItem(localeCookieName, locale);
  document.documentElement.lang = locale;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(resolveLocale(initialLocale));

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const switchLocale = useCallback((nextLocale: Locale) => {
    setLocale(resolveLocale(nextLocale));
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale((current) => (current === 'th' ? 'en' : 'th'));
  }, []);

  const value = useMemo(
    () => ({ locale, switchLocale, toggleLocale }),
    [locale, switchLocale, toggleLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={getMessages(locale)}
        timeZone="Asia/Bangkok"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSwitcher(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('useLocaleSwitcher must be used inside I18nProvider');
  }
  return value;
}
