-- KMO BK01 Gate 1B — LIVE DATABASE READ-ONLY AUDIT (single JSON result)
-- Target project: xfhpwxjywqgqefbncumm
-- SELECT-only. Designed for Supabase CLI db query JSON output.

select jsonb_build_object(
  'capture', jsonb_build_object(
    'database_name', current_database(),
    'database_user', current_user,
    'postgres_version', current_setting('server_version'),
    'captured_at', now()
  ),
  'schemas', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.schema_name), '[]'::jsonb)
    from (select schema_name from information_schema.schemata
          where schema_name in ('public','local_service','kmo_bridge','storage','auth')) x
  ),
  'tables', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema, x.table_name), '[]'::jsonb)
    from (select table_schema, table_name, table_type from information_schema.tables
          where table_schema in ('public','local_service','kmo_bridge')) x
  ),
  'columns', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema, x.table_name, x.ordinal_position), '[]'::jsonb)
    from (select table_schema, table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
          from information_schema.columns
          where table_schema in ('public','local_service','kmo_bridge')) x
  ),
  'constraints', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema, x.table_name, x.constraint_type, x.constraint_name), '[]'::jsonb)
    from (select tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
          from information_schema.table_constraints tc
          left join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
          where tc.table_schema in ('public','local_service','kmo_bridge')) x
  ),
  'indexes', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname, x.tablename, x.indexname), '[]'::jsonb)
    from (select schemaname, tablename, indexname, indexdef from pg_indexes
          where schemaname in ('public','local_service','kmo_bridge')) x
  ),
  'rls_flags', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.schema_name, x.table_name), '[]'::jsonb)
    from (select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relkind in ('r','p') and n.nspname in ('public','local_service','kmo_bridge')) x
  ),
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname, x.tablename, x.policyname), '[]'::jsonb)
    from (select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          from pg_policies where schemaname in ('public','local_service','kmo_bridge')) x
  ),
  'triggers', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.table_schema, x.table_name, x.trigger_name, x.event_manipulation), '[]'::jsonb)
    from (select event_object_schema as table_schema, event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
          from information_schema.triggers
          where event_object_schema in ('public','local_service','kmo_bridge')) x
  ),
  'functions', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.schema_name, x.function_name, x.arguments), '[]'::jsonb)
    from (select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments,
                 pg_get_function_result(p.oid) as result_type, p.prosecdef as security_definer
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public','local_service','kmo_bridge')) x
  ),
  'storage_buckets', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
    from (select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at from storage.buckets) x
  ),
  'migrations', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.version), '[]'::jsonb)
    from (select version, name from supabase_migrations.schema_migrations) x
  ),
  'counts', jsonb_build_array(
    jsonb_build_object('relation','public.bookings','row_count',(select count(*) from public.bookings)),
    jsonb_build_object('relation','public.orders','row_count',(select count(*) from public.orders)),
    jsonb_build_object('relation','public.customers','row_count',(select count(*) from public.customers)),
    jsonb_build_object('relation','public.production_allocations','row_count',(select count(*) from public.production_allocations))
  ),
  'existence', jsonb_build_object(
    'local_service_exists', to_regnamespace('local_service') is not null,
    'kmo_bridge_exists', to_regnamespace('kmo_bridge') is not null,
    'bk01_bookings_exists', to_regclass('local_service.bookings') is not null,
    'legacy_bookings_exists', to_regclass('public.bookings') is not null,
    'legacy_orders_exists', to_regclass('public.orders') is not null
  )
) as audit;
