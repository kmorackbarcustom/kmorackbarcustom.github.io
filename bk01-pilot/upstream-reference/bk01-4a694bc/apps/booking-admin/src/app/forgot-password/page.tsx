'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, ArrowLeft, Send, CheckCircle2, KeyRound } from 'lucide-react';
import { LanguageToggle } from '@/components/language-toggle';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1200);
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="max-w-md w-full space-y-6">
        {/* Top Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/40 shadow-xl">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-3">{t('forgotTitle')}</h1>
          <p className="text-xs text-slate-400">{t('forgotSubtitle')}</p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white">{t('forgotSuccessTitle')}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('forgotSuccessBody', { email })}
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" /> {t('backToLogin')}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">{t('ownerEmailLabel')}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    required
                    type="email"
                    placeholder="owner@yourshop.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  t('forgotSubmitting')
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('forgotSubmit')}
                  </>
                )}
              </button>

              <div className="text-center pt-2 border-t border-slate-800">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> {t('backHome')}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
