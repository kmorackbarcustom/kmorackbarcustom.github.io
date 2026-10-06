-- Applied to Supabase project kmo-hr (ybyseaenceyswjnwdmdf)
-- 2026-10-06: remove unused/insecure legacy HR v1 database objects.
-- Does NOT touch kmo_finance.*, wc_*, links, catalog storage, or auth.users.

drop table if exists public.bonus_history;
drop table if exists public.bonus_calculations;
drop table if exists public.bonus_settings;
drop table if exists public.leave_quota;
drop table if exists public.leave_requests;
drop table if exists public.employees;

drop function if exists public.bonus_update_on_leave_change();
drop function if exists public.bonus_recalculate_all(integer);
drop function if exists public.leave_calculate_advance_notice();
drop function if exists public.leave_determine_counts_as_occurrence();

drop policy if exists "anon can upload medical certs" on storage.objects;
