import { createClient } from './supabase/client';

// Backward-compatible browser client for the existing admin service.
// Server Components and route handlers must use lib/supabase/server instead.
export const supabase = createClient();
