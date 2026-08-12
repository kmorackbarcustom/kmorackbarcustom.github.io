-- Both tables are only ever accessed by edge functions via the service role key
-- (createServiceClient()), which bypasses RLS regardless of policies. No client-side
-- page queries either table with the anon key (verified via repo-wide grep before
-- applying). Enabling RLS with zero policies fully blocks anon/authenticated access
-- and has no effect on existing service-role code paths.
alter table public.customers enable row level security;
alter table public.notifications_log enable row level security;
