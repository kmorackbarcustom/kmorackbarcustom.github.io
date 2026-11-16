-- baseline สถานะ RLS + สิทธิ์ตาราง (acl) + policy ของ 4 ตาราง

-- ==== policy public.bookings anon can insert bookings ====
-- anon can insert bookings: permissive=PERMISSIVE cmd=INSERT roles={anon}
-- USING: -
-- WITH CHECK: true

-- ==== policy public.holidays anon can read holidays ====
-- anon can read holidays: permissive=PERMISSIVE cmd=SELECT roles={anon}
-- USING: true
-- WITH CHECK: -

-- ==== rls public.bookings ====
-- rls_enabled=true force_rls=false owner=postgres acl={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ==== rls public.holidays ====
-- rls_enabled=true force_rls=false owner=postgres acl={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ==== rls public.orders ====
-- rls_enabled=true force_rls=false owner=postgres acl={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ==== rls public.production_allocations ====
-- rls_enabled=true force_rls=false owner=postgres acl={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
