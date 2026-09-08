-- Minimal Supabase auth stub for QA database (booking_qa)
-- Bootstraps only what the booking migrations reference: auth.users(id) FK target
-- and the auth.uid() function. Roles anon/authenticated/service_role already exist
-- cluster-wide in the container.

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal users table: only the `id` column the migrations FK against.
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Supabase-style auth.uid() reads the JWT sub claim from the request header.
-- For SECURITY DEFINER functions called as the authenticated role, Supabase
-- injects request.jwt.claims. We stub it to read from GUC set by the test.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Also the role helper Supabase provides, in case any RLS / policy uses it.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon')
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON TABLE auth.users TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
