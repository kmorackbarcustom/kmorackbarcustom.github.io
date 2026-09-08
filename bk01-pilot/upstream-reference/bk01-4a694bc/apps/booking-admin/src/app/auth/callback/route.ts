import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/register';
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(requestUrl.searchParams.get('next'));
  const supabase = await createClient();

  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = 'ลิงก์ยืนยันอีเมลไม่สมบูรณ์';
  }

  if (errorMessage) {
    const errorUrl = new URL('/register', requestUrl.origin);
    errorUrl.searchParams.set('auth_error', errorMessage);
    return NextResponse.redirect(errorUrl);
  }

  const destination = new URL(next, requestUrl.origin);
  destination.searchParams.set('confirmed', '1');
  return NextResponse.redirect(destination);
}
