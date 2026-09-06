import 'server-only';

import { createClient } from '@supabase/supabase-js';

function createSupabaseAdminClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    db: {
      schema: 'local_service',
    },
  });
}

let adminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are not configured');
  }

  adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey);

  return adminClient;
}