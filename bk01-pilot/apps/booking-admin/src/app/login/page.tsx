'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { LanguageToggle } from '@/components/language-toggle';

function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const next = searchParams.get('next');
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('loginFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white">{t('loginTitle')}</h1>
          <p className="mt-1 text-xs text-slate-400">{t('loginSubtitle')}</p>
        </div>

        {errorMessage && (
          <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {errorMessage}
          </p>
        )}

        <label className="block space-y-1 text-xs font-semibold text-slate-300">
          <span>{t('emailLabel')}</span>
          <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" />
        </label>

        <label className="block space-y-1 text-xs font-semibold text-slate-300">
          <span>{t('passwordLabel')}</span>
          <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-white outline-none focus:border-emerald-500" />
        </label>

        <button disabled={isSubmitting} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? t('submittingLogin') : t('loginTitle')}
        </button>

        <div className="flex justify-end text-xs">
          <Link href="/forgot-password" className="text-slate-400 hover:text-white">{t('forgotPasswordLink')}</Link>
        </div>
      </form>
    </main>
  );
}

function LoginFallback() {
  const t = useTranslations('common');
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center text-xs">
      {t('loading')}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
