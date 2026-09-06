# KMO BK01 Database Cutover Plan

Status: GATE 1 COMPLETE — READ-ONLY LIVE AUDIT
Owner scope: KMO RACKBARCUSTOM only
Production project ref: `xfhpwxjywqgqefbncumm`

## Non-negotiable safety rule
KMO already has real customers, bookings, orders, production scheduling, LINE/Telegram flows and reminders.
No BK01 deployment may destructively replace or reshape the existing `public.*` production model.

## Confirmed architecture from repository evidence
Existing KMO production domain uses `public.*`, including:
- `public.bookings`
- `public.orders`
- `public.customers`
- `public.production_allocations`

Existing booking fields include KMO-specific job/vehicle/production concepts such as `job_id`,
`brand`, `model`, `product`, `appointment_date`, `pickup_date`, `queue_status` and `production_status`.
Existing functions and Edge Functions depend on these contracts.

BK01 uses a separate `local_service.*` model centered on shop/service/staff/time-slot/deposit booking.
Therefore KMO legacy booking and BK01 booking are not safe 1:1 table replacements.

## Target database shape
```text
KMO Supabase
├── public.*              existing KMO operational system
├── local_service.*       BK01 booking engine
├── kmo_booking.*         KMO-only booking detail extension
└── kmo_bridge.*          mapping/reconciliation/cutover boundary
```

KMO extension data that does not belong in canonical BK01 lives in `kmo_booking.*`,
with booking detail rows keyed by `local_service.bookings.id`. `kmo_bridge.*` remains mapping/reconciliation only.

## Nine release gates
1. **Live DB audit** — schema, RLS, triggers, functions, storage, migration history, counts.
2. **Schema contract lock** — classify what remains `public`, what is BK01, and what belongs in bridge/extensions.
3. **KMO extension design** — preserve vehicle/job/pickup/LINE/production concepts without contaminating BK01 core.
4. **KMO BK01 baseline** — generate an end-state baseline; do not blindly replay historical BK01 migrations.
5. **Dark deploy** — create isolated BK01/bridge objects while legacy booking remains active.
6. **Mapping/backfill** — migrate only operationally necessary active/future records first; reconcile counts and identifiers.
7. **Admin shadow mode** — validate new admin against mapped data while customers still use legacy booking.
8. **Controlled cutover** — short write freeze, final delta reconciliation, route switch, legacy becomes fallback/read-only.
9. **Stabilization** — retain rollback path until real-customer pilot is proven stable.

No gate may inherit PASS from documentation alone; evidence must come from the KMO production runtime or reproducible tests.

## Hard stops
- Do not rename/drop `public.bookings`, `public.orders` or `public.customers` during the pilot.
- Do not alter legacy triggers/RPC contracts merely to make BK01 fit.
- Do not dual-write indefinitely; use shadow/reconciliation then a controlled cutover.
- Do not apply the imported BK01 migration chain directly to KMO production.
- Do not expose service-role/server credentials to either browser app.
- Do not remove `booking.html` or `bookingdashboard.html` before rollback criteria are closed.

## Gate 1 execution artifact
Read-only audit SQL:
`bk01-pilot/scripts/kmo-live-db-audit.sql`

The audit file intentionally returns metadata/counts only and must remain SELECT-only.
It must be run against linked KMO project `xfhpwxjywqgqefbncumm` before baseline SQL is authored.
Customer rows, payment details and secrets are not required for the schema audit.

## Gate 1 current state
- Supabase CLI login: owner completed 2026-09-06.
- Local KMO project link: repository evidence points to `xfhpwxjywqgqefbncumm`.
- ChatGPT Supabase connector: different account; must not be used for KMO mutation.
- Repository dependency audit: confirms legacy `public.bookings` is operational infrastructure, not disposable data.
- Live database audit: COMPLETE on 2026-09-06 through authenticated KMO CLI.
- Confirmed live schemas currently include `public`, `auth`, and `storage`; `local_service` and `kmo_bridge` do not exist yet.
- Confirmed existing operational `public.bookings`, `public.orders`, `public.customers`, and `public.production_allocations` are populated and must remain protected.
- Confirmed production has a substantial existing migration/function/trigger/RLS surface; Gate 2 must design around the live contracts rather than replay BK01 history.
- Raw audit JSON is local evidence only and is intentionally Git-ignored.

Gate 2 schema ownership contract: `bk01-pilot/KMO_SCHEMA_CONTRACT.md` — PASS / LOCKED.

Gate 3 extension/bridge design: `bk01-pilot/KMO_EXTENSION_DESIGN.md` — PASS / LOCKED.

Next: Gate 4 dependency-safe KMO BK01 baseline + rollback package. No production DDL has been applied.
