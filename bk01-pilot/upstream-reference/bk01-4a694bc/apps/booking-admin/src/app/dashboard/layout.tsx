import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect('/login?next=/dashboard');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('shop_users')
    .select('shop_id, role')
    .eq('user_id', data.claims.sub)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`ตรวจสอบสิทธิ์ร้านค้าไม่สำเร็จ: ${membershipError.message}`);
  }

  if (!membership) {
    redirect('/register?resume=1');
  }

  return (
    <>
      <form action={signOut} className="fixed right-4 top-4 z-[100]">
        <button className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs font-semibold text-slate-300 shadow-lg hover:bg-slate-800">
          ออกจากระบบ
        </button>
      </form>
      {children}
    </>
  );
}
