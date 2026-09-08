# Phase E3.1 local checkpoint — services, staff, and role authorization

Date: 2026-08-08
Status: local implementation complete; live migration and role-matrix verification pending approval

## Implemented locally

- Added the required `has_shop_role()` and `is_shop_owner()` helpers.
- Removed authenticated direct write privileges from `services` and `staff`.
- Added authenticated-only RPCs for:
  - creating, updating, and enabling/disabling services;
  - creating and enabling/disabling staff.
- Service writes require owner or admin.
- Staff writes require owner.
- New service/staff records require an idempotency key and use per-shop unique indexes.
- Service validation enforces a non-blank name, 15-minute duration increments, non-negative prices, and deposit not exceeding price.
- Services use soft disable through `is_active`; no hard delete is attempted against booking foreign keys.
- Dashboard service and staff sections now load tenant-scoped rows from Supabase.
- Removed `INITIAL_SERVICES`, `INITIAL_STAFF`, fake IDs, and local-only success mutations.
- Added real create/update/enable-disable calls, role-aware controls, empty/error states, and mutation locking.
- Changed destructive wording from delete to enable/disable behavior.

## Migration

`supabase/migrations/20260807174438_phase_e3_1_services_staff_authorization.sql`

All privileged functions:

- validate authorization inside the function;
- use a fixed `search_path`;
- revoke execution from `PUBLIC`, `anon`, and `service_role`;
- grant execution only to `authenticated`.

## Local verification

- Targeted ESLint: zero errors; one existing dynamic slip `<img>` warning remains.
- Root `npm run build`: passed for consumer and admin with zero TypeScript/build errors.
- `git diff --check`: passed.
- No service/staff mock constants or fake mutation handlers remain.
- `.env.local` and live Supabase were not touched.

## Required live verification

1. Apply the E3.1 migration to project `gyleqrjdzwwlqierdwcy`.
2. Verify anon cannot execute any E3.1 RPC.
3. Verify authenticated direct inserts/updates/deletes on `services` and `staff` are blocked.
4. Verify owner can create/update/disable/enable services.
5. Verify admin can create/update/disable/enable services.
6. Verify staff role cannot mutate services.
7. Verify owner can create/disable/enable staff.
8. Verify admin and staff roles cannot mutate staff.
9. Verify cross-tenant IDs are rejected by every update/toggle RPC.
10. Verify duplicate create calls with the same idempotency key create one row.
11. Verify invalid duration, price, and deposit values are rejected.
12. Browser-test real service/staff lists and refresh after every mutation.

## Out of scope

- Schedules and holidays remain E3.2.
- Shop profile, PromptPay, and safe LINE settings remain E3.3.
- The existing dynamic slip image optimization warning is unrelated to E3.1.
