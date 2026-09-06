-- KMO BK01 Gate 1B — LIVE DATABASE READ-ONLY AUDIT
-- Target project: xfhpwxjywqgqefbncumm
-- IMPORTANT: SELECT-only. Do not add DDL/DML to this file.
-- Purpose: capture production schema state before BK01 baseline design.

select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as postgres_version,
       now() as captured_at;

-- 1. Schemas
select schema_name
from information_schema.schemata
where schema_name in ('public','local_service','kmo_bridge','storage','auth')
order by schema_name;

-- 2. Tables/views in business schemas
select table_schema, table_name, table_type
from information_schema.tables
where table_schema in ('public','local_service','kmo_bridge')
order by table_schema, table_name;

-- 3. Columns and defaults
select table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema in ('public','local_service','kmo_bridge')
order by table_schema, table_name, ordinal_position;

-- 4. Constraints
select tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
where tc.table_schema in ('public','local_service','kmo_bridge')
order by tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5. Indexes
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('public','local_service','kmo_bridge')
order by schemaname, tablename, indexname;

-- 6. RLS flags
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p')
  and n.nspname in ('public','local_service','kmo_bridge')
order by n.nspname, c.relname;

-- 7. RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
from pg_policies
where schemaname in ('public','local_service','kmo_bridge')
order by schemaname, tablename, policyname;

-- 8. Triggers
select event_object_schema as table_schema,
       event_object_table as table_name,
       trigger_name, action_timing, event_manipulation,
       action_statement
from information_schema.triggers
where event_object_schema in ('public','local_service','kmo_bridge')
order by event_object_schema, event_object_table, trigger_name, event_manipulation;

-- 9. Functions/RPC signatures only
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','local_service','kmo_bridge')
order by n.nspname, p.proname, arguments;

-- 10. Storage buckets (metadata only)
select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
from storage.buckets
order by id;

-- 11. Supabase migration history
select version, name
from supabase_migrations.schema_migrations
order by version;

-- 12. Operational table counts only — no customer rows returned
select 'public.bookings' as relation, count(*) as row_count from public.bookings
union all select 'public.orders', count(*) from public.orders
union all select 'public.customers', count(*) from public.customers
union all select 'public.production_allocations', count(*) from public.production_allocations;

-- 13. BK01 schemas must not be assumed present before this audit
select to_regnamespace('local_service') is not null as local_service_exists,
       to_regnamespace('kmo_bridge') is not null as kmo_bridge_exists,
       to_regclass('local_service.bookings') is not null as bk01_bookings_exists,
       to_regclass('public.bookings') is not null as legacy_bookings_exists,
       to_regclass('public.orders') is not null as legacy_orders_exists;

-- END. This file intentionally contains SELECT statements only.
