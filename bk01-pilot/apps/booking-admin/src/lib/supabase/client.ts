import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './config';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'local_service' },
  });

  return browserClient;
}
