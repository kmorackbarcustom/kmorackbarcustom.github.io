'use client';

import { useTranslations } from 'next-intl';
import { useLocaleSwitcher } from '@/i18n/locale-provider';

const baseClassName =
  'inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-slate-100 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:border-emerald-500/60 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

export function LanguageToggle() {
  const t = useTranslations('common');
  const { locale, toggleLocale } = useLocaleSwitcher();
  const nextLocale = locale === 'th' ? 'en' : 'th';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={baseClassName}
      aria-label={nextLocale === 'en' ? t('switchToEnglish') : t('switchToThai')}
      title={nextLocale === 'en' ? t('switchToEnglish') : t('switchToThai')}
    >
      🌐 {nextLocale.toUpperCase()}
    </button>
  );
}
