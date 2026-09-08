# KMO BK01 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Gate 4/5 Preflight

Status: **DRAFT ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â must PASS before dark deploy**
Date: 2026-09-07
Target Supabase project: `xfhpwxjywqgqefbncumm` (`KMO-Booking`)

## Project identity
Before any remote SQL execution:
1. `git status` must be clean or changes explicitly reviewed.
2. Branch must be `pilot/bk01-independent-deployment`.
3. Supabase CLI profile must be the shared Developer profile on this machine.
4. Linked project ref must read back exactly `xfhpwxjywqgqefbncumm`.
5. Re-run a SELECT-only identity probe before apply.

A project-name match is insufficient; the exact ref is the authority.
## Backup / rollback evidence
Before Gate 5 apply, capture:
- current production schema metadata via the SELECT-only Gate 1 audit;
- Supabase migration history;
- current `public.bookings`, `public.orders`, `public.customers`, `public.production_allocations` counts;
- a recoverable database backup or equivalent verified restore path;
- baseline rollback SQL hash and baseline SQL hash.

Rollback must target only objects introduced by the KMO BK01 dark deploy.
It must never drop, truncate, rename or rewrite existing KMO `public.*` tables.
## SQL safety checks
Baseline SQL must prove all of the following before execution:
- no `DROP`, `TRUNCATE`, `RENAME`, destructive `ALTER`, or DML against existing KMO `public.*`;
- no demo seed, Stripe seed, WSTERA identity, service-role secret, or production credential;
- only `local_service`, `kmo_booking`, `kmo_bridge` are created/owned by the package;
- required foreign keys to `auth.users` are explicit and non-cascading where account deletion must not erase business evidence;
- every security-definer function sets a fixed search path;
- RLS is enabled before browser-facing access is granted;
- no anonymous direct INSERT policy exists on `local_service.customers` or `local_service.bookings`.
## API exposure
The booking/admin apps explicitly use the `local_service` schema.
Gate 5 must verify Supabase API exposed-schema configuration includes `local_service`.

Do **not** expose `kmo_booking` or `kmo_bridge` through PostgREST unless a concrete server/API route requires it later.
Server-side privileged operations must remain server-only.

## Dark-deploy smoke requirements
Before any customer route switch:
- create/read KMO shop configuration through approved admin/server path;
- admin authentication and shop membership resolve correctly;
- services/staff/schedules/holidays can be managed;
- consumer availability loads;
- booking hold collision protection works;
- deposit slip submission and manual verification work;
- LINE/notification queue path works without changing existing KMO LINE production behavior;
- existing `booking.html` and `bookingdashboard.html` still operate unchanged.
## Abort conditions
Abort Gate 5 immediately if any of these occur:
- linked project ref differs from `xfhpwxjywqgqefbncumm`;
- baseline references destructive changes to existing `public.*`;
- a required RPC/table/view is absent after dependency review;
- RLS/grants expose bridge or private customer data anonymously;
- backup/restore evidence is missing;
- existing KMO booking/order/production checks change during dark deploy;
- any required real KMO value would have to be guessed.

## Current verdict
Project/profile preparation: **READY**.
Gate 1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“3 evidence: **PASS / LOCKED**.
Gate 4 dependency manifest: **LOCKED**.
Baseline SQL + rollback SQL: **PASS / LOCKED**.
Static verifier + PostgreSQL parse: **PASS**.
Production dark deploy: **PRE-AUTHORIZED** — backup/restore evidence is PASS; immediate pre-apply identity/count/schema/bucket readback remains required.
## Storage preflight
Before dark deploy, verify `deposit-slips` is absent or already matches the locked private configuration.
If an unexpected bucket with that ID exists, abort rather than mutate it silently.
After creation, verify:
- `public = false`;
- max file size = 5 MiB;
- MIME allow-list is JPEG/PNG/WebP only;
- anon has no direct object read/write policy;
- authenticated read is restricted to owner/admin bookings in the same shop;
- server-issued signed upload still requires a valid booking recovery capability.
## Gate 4 verification snapshot ? 2026-09-07
- Linked ref: `xfhpwxjywqgqefbncumm` confirmed.
- Target schemas `local_service`, `kmo_booking`, `kmo_bridge`: absent.
- `deposit-slips` bucket: absent.
- Protected counts: bookings 143; orders 214; customers 75; production allocations 30.
- Supabase migration count: 43.
- Baseline SHA-256: `a79867b65d91a3e7958a6d96b0d002f031f4c1c20cb5bff96683014689da60ea`.
- Rollback SHA-256: `381464103d22d50c6d6d52208027ac849c7417ad10faee25ac33b446ae0c05f9`.
- App tests 17/17 PASS; lint 0 errors / 8 inherited warnings; both production builds PASS.

Backup/restore blocker: **CLOSED / PASS 2026-09-08**. Remaining action before production DDL: repeat exact project-ref, public-count, target-schema, bucket, and Data API exposure preflight immediately before apply.

## Gate 5 backup checkpoint — 2026-09-08
- Single-statement logical snapshot: 28 `public` tables / 2,706 rows; contains production customer/business data and remains outside Git.
- Critical snapshot counts: bookings 143; customers 80; orders 215; production allocations 21.
- Restore validation PASS for every table against live row types; emergency restore artifact parses and remains `ROLLBACK` by default.
- Current Data API exposed schemas before dark deploy: `public, graphql_public`. Gate 5 must preserve both and add only `local_service` after the schema exists.
- `authenticator` currently has no manual `pgrst.db_schemas` role override; keep configuration ownership with Supabase Management API rather than introducing a role-level override.
- Baseline SHA-256 after public-column minimization: `a79867b65d91a3e7958a6d96b0d002f031f4c1c20cb5bff96683014689da60ea`; parser 157 statements PASS; static verifier PASS.
