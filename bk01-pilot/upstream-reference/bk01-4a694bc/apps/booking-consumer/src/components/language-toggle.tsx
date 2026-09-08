'use client';

import { useTranslations } from 'next-intl';
import { useLocaleSwitcher } from '@/i18n/locale-provider';

type LanguageToggleVariant = 'landing' | 'booking';

const baseClassName =
  'inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-bold text-slate-100 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:border-emerald-500/60 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

const variantClassName: Record<LanguageToggleVariant, string> = {
  landing: 'absolute right-4 top-4 z-[70]',
  booking: 'fixed right-4 top-16 z-[80] sm:right-[calc(50%-13rem)]',
};

export function LanguageToggle({ variant }: { variant: LanguageToggleVariant }) {
  const t = useTranslations('common');
  const { locale, toggleLocale } = useLocaleSwitcher();
  const nextLocale = locale === 'th' ? 'en' : 'th';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`${baseClassName} ${variantClassName[variant]}`}
      aria-label={nextLocale === 'en' ? t('switchToEnglish') : t('switchToThai')}
      title={nextLocale === 'en' ? t('switchToEnglish') : t('switchToThai')}
    >
      🌐 {nextLocale.toUpperCase()}
    </button>
  );
}
