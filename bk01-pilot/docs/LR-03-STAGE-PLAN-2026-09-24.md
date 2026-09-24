# LR-03 — KMO DB CONTRACT (B2 CRITICAL) — SoT RESOLUTION + STAGE PLAN

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Stage base: `6cec5255df0208164c28b863c35d75b65ec00791`
Review Batch: `B2` CRITICAL (LR-03 + LR-04)
Status: `MATERIALIZED — awaiting first work-unit dispatch`

## 0. Source-of-Truth path correction (recorded, not silently worked around)

The Run Manifest lists as LR-03 Source of Truth:

```text
7. `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, `docs/DOCUMENTATION_INDEX.md`
```

Those two contract files are **not** under `docs/`. Measured:

```text
bk01-pilot/docs/KMO_SCHEMA_CONTRACT.md   -> MISSING
bk01-pilot/docs/KMO_EXTENSION_DESIGN.md  -> MISSING
bk01-pilot/KMO_SCHEMA_CONTRACT.md        -> EXISTS (108 lines, "LOCKED — Gate 2 complete")
bk01-pilot/KMO_EXTENSION_DESIGN.md       -> EXISTS (122 lines, "LOCKED — Gate 3 complete")
```

Both are `LOCKED` and both were read in full before any LR-03 materialization. The manifest's
relative path is imprecise; the files themselves are present and authoritative. Recorded here so
the next session does not treat them as missing SoT.

## 1. Section A — privilege parity: the real requirement (resolved from evidence)

Brief section A says: *"reconcile KMO baseline/migration source with the already-proven runtime
repair — anon SELECT only on `staff_schedules.shop_id`; anon SELECT only on `shop_holidays.shop_id`;
preserve current RLS/policies; **no table-wide SELECT and no write privilege**."*

Read literally in isolation, "anon SELECT **only** on `shop_id`" could be misread as *reduce* anon to
`shop_id` alone. That reading is **wrong and would break the live booking page**, because
`apps/booking-consumer/src/lib/booking-service.ts` reads:

```text
.from('staff_schedules') .select('staff_id, day_of_week, is_working_day, work_start, work_end, break_start, break_end')
.from('shop_holidays')   .select('staff_id, holiday_date, reason')
```

The proven runtime repair disambiguates it. The BK01 R4 evidence — which section A explicitly says
to reconcile *against* — states verbatim:

```sql
GRANT SELECT (shop_id) ON local_service.staff_schedules TO anon;
GRANT SELECT (shop_id) ON local_service.shop_holidays TO anon;
```

and its post-state verification reads:

```text
anon SELECT on staff_schedules.shop_id = true, shop_holidays.shop_id = true
anon table-level SELECT still FALSE on both; INSERT/UPDATE/DELETE still FALSE on both
Effective anon column set exposed:
  schedules {shop_id, staff_id, day_of_week, is_working_day, work_start, work_end, break_start, break_end}
  holidays  {shop_id, staff_id, holiday_date, reason} — unchanged payload contract plus the single predicate column
```

Measured current baseline (`KMO_BK01_BASELINE.sql`):

```text
line 1748  GRANT SELECT(staff_id,day_of_week,is_working_day,work_start,work_end,break_start,break_end)
           ON local_service.staff_schedules TO anon;        <- shop_id NOT granted
line 1750  GRANT SELECT(staff_id,holiday_date,reason)
           ON local_service.shop_holidays TO anon;          <- shop_id NOT granted
```

**Conclusion (resolved, not assumed):** section A's deliverable is to **add** the `shop_id` predicate
grant to `anon` on those two tables — the column-level `shop_id` grant is the only addition, and the
existing column grants stay. That is exactly the proven runtime state, it satisfies "no table-wide
SELECT and no write privilege" (both remain column-scoped), and it is what the consumer page needs.

This is **not** an Owner decision gap: the requirement is resolvable from the locked SoT plus the
proven live mechanism, and both sources agree once the sentence is read against the evidence the
brief itself names. It is recorded here because misreading it in either direction is a real risk —
too narrow breaks the booking page, too broad violates the security contract.

## 2. What LR-03 must produce (from the locked Manifest + Plan §4/§5)

New KMO-owned objects under `kmo_booking` (never added to generic `local_service.*` for convenience):

| Object | Shape required by Plan §4 |
|---|---|
| `kmo_booking.intake_settings` | `shop_id` PK/FK → `local_service.shops`; `daily_capacity_units integer >= 0`; `default_booking_units integer >= 1`; audit timestamps/actor. **Missing row ⇒ public hold/reschedule capacity path fails closed.** |
| `kmo_booking.service_intake_policy` | optional row per `local_service.services.id`; `shop_id` + `service_id`; `intake_units integer >= 1`. Service override wins, else the explicitly configured shop default. |
| `kmo_booking.booking_intake` | one immutable capacity snapshot per `local_service.bookings.id`; `booking_id`, `shop_id`, `intake_units`, source/policy metadata, timestamps. Browser cannot submit arbitrary units. Reschedule reuses the snapshot. |
| `kmo_booking.booking_work_state` | one row per applicable confirmed Booking; states `WAITING_TO_START` / `IN_PROGRESS` / `COMPLETED`; actor + started/completed timestamps; transitions only via owner/admin-authorized RPC; accepted transitions write an audit event; failed transitions are atomic no-op. |

Plus, per Manifest LR-03 acceptance: close **weekly fail-closed**, **staff-hours DB invariant**, and
**narrow predicate grants**; **no broad grants**; browser has **no privileged table write**; rollback
is bounded; `public.orders` / production tables untouched.

Current state of those three:

```text
weekly fail-closed   ALREADY PRESENT: KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql provides
                     ensure_shop_weekly_schedule_rows() (7-row backfill trigger on shops INSERT,
                     ON CONFLICT DO NOTHING) + enforce_shop_weekly_booking_hours() raising
                     SHOP_WEEKLY_SCHEDULE_NOT_CONFIGURED / SHOP_CLOSED_RECURRING_WEEKDAY /
                     SHOP_OUTSIDE_WEEKLY_HOURS
staff-hours invariant  NOT YET ENFORCED: no trigger found rejecting staff working hours outside
                     authoritative shop hours (brief section E)
predicate grants     NOT YET IN SOURCE: the two shop_id grants exist live but are absent from
                     baseline SQL (see section 1)
```

## 3. Work-unit decomposition (Manifest rule: one unit = one capability class)

The Manifest LR-03 row assigns `swarm-db` for SQL qualification and `swarm-builder` for the paired
patch/rollback files, and states composite stages **must be split into separate revision-bound work
units before dispatch**.

| # | Work unit | Capability | Worker | Scope |
|---|---|---|---|---|
| 1 | `LR03-WU01-EXTENSION-SCHEMA-PATCH` | `implementation` | `swarm-builder` | new paired patch + rollback SQL: the four `kmo_booking` objects, the two `shop_id` predicate grants, the staff-hours invariant, RLS + narrow grants, **no runtime apply** |
| 2 | `LR03-WU02-SQL-QUALIFICATION` | `database_qualification` | `swarm-db` | static/dependency qualification of WU01's files: dependency closure, no broad grants, browser has no privileged write, rollback boundedness, protected-object non-interference |

Both are read/write inside `bk01-pilot/supabase/kmo-baseline/**` only. `LR-03` performs **no runtime
apply**; any apply is `LR-08` / Owner-authorized.

## 4. Explicit non-goals for LR-03

```text
no runtime/production schema apply, deploy or cutover
no Order / Claim / KMO Control implementation
no write to public.orders / public.production_allocations
no KMO-only column added to generic local_service.shops/services/bookings
no broad grant and no browser privileged-table write
no generic cross-domain capacity engine
no canonical BK01 mutation
```

## 5. Stop conditions

`OWNER_PRODUCTION_ACTION_REQUIRED` only if LR-03 unexpectedly requires production mutation (it does
not: it produces paired SQL files). Otherwise the normal B2 critical boundary applies: WU01 → WU02
qualification → B2 independent review on the exact SHA before LR-04 may run.
