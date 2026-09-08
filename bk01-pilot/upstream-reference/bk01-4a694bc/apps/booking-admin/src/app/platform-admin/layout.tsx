import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function PlatformAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect('/login?next=/platform-admin');
  }

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_platform_admin');

  if (adminCheckError) {
    throw new Error(`ตรวจสอบสิทธิ์ platform admin ไม่สำเร็จ: ${adminCheckError.message}`);
  }

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
