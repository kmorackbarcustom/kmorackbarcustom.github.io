\set ON_ERROR_STOP on
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE net._calls(id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb);
CREATE TABLE net._config(fail boolean NOT NULL DEFAULT false);
INSERT INTO net._config(fail) VALUES(false);
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $stub$
DECLARE v_id bigint;
BEGIN
  IF (SELECT fail FROM net._config LIMIT 1) THEN RAISE EXCEPTION 'stub failure'; END IF;
  INSERT INTO net._calls(url, headers, body) VALUES($1, $2, $3) RETURNING id INTO v_id;
  RETURN v_id;
END
$stub$;
CREATE SEQUENCE public.bookings_id_seq;
CREATE SEQUENCE public.holidays_id_seq;
CREATE TABLE public.customers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_uid text UNIQUE, platform text,
  name text, phone text, updated_at timestamptz DEFAULT now()
);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA net TO anon, authenticated, service_role;
-- Mirror Supabase default privileges so REVOKEs in the migration are actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
