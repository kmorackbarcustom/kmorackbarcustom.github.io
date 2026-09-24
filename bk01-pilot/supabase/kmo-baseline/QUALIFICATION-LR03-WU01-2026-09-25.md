# LR-03 / LR03-WU01 — Static Database Qualification

Work unit: `LR03-WU02-SQL-QUALIFICATION`
Correlation id: `kmo-d1a-lr03`
Role class: database_qualification
Date: 2026-09-25 (Asia/Bangkok)
Workspace: `D:/AI-Workspace/runtime/worktrees/kmo-d1a-longrun-20260924`
Revision qualified: `f82994be1fb58e26b7fa828ab0dd57e88ce3486f`
Method: **static read of committed SQL source only.** No database connection was made. `psql`,
`supabase db`, `docker` and every live database endpoint were NOT invoked. No live database was
read, written or migrated. No SQL file was edited. The only artifact written by this work unit is
this report.

Worktree integrity: `git status --porcelain=v1 --untracked-files=no` returned **empty** (clean)
both before and after the run. The four files under qualification are the four files added by
`f82994b` (`git show --stat f82994b` → 4 files, 530 insertions). The inspected revision is therefore
committed truth, not a sibling draft.

### 0.1 HEAD moved during this qualification (reported, immaterial to the hashes)

- HEAD at run start: `f82994be1fb58e26b7fa828ab0dd57e88ce3486f` (the revision named in this work
  packet).
- HEAD at run end: `ed3dfbf2be916ebac1eee83a019cc7dfc9f3f7b9` ("docs(kmo): LR-03 evidence — WU01
  PASS, section A resolved, attempt ledger").
- A concurrent sibling unit committed `ed3dfbf` mid-run. `git show --stat ed3dfbf` → **1 file
  changed, 164 insertions: `bk01-pilot/docs/LR-03-EVIDENCE-2026-09-24.md` only.**
- `git diff --name-only f82994b ed3dfbf2 -- bk01-pilot/supabase/kmo-baseline/` returns **empty**:
  no file under `kmo-baseline/` changed. The nine sha256 values in section 0 were re-hashed after
  this report was written and are **byte-identical** to the values taken at the start of the run.
- Consequence: this qualification is valid for the qualified file set at both revisions. HEAD is
  not a usable pin for the SQL files here — the sha256 table in section 0 is.
- **Material discrepancy for the commander:** the sibling commit's subject already asserts
  "WU01 PASS", while this static qualification returns `REMEDIATE` with one HIGH defect (D-01). The
  two claims cannot both be correct as stated. Per prohibited scope I did **not** open
  `bk01-pilot/docs/**`, so that file's reasoning was not inspected and is not judged here — the
  discrepancy is reported, not adjudicated.

## 0. Input hashes (exact revisions qualified)

| File | sha256 |
|---|---|
| `KMO_BK01_INTAKE_WORK_STATE_PATCH.sql` | `47c3cb5d8ee74e88ddca52478886d77f7577869652721dfd8af9cd92007dd2b3` |
| `KMO_BK01_INTAKE_WORK_STATE_ROLLBACK.sql` | `3c2e731ffe2e0ebc4484b631fa1e45bf4c4dac4969c53dc9d46d5b3aecc66482` |
| `KMO_BK01_PREDICATE_GRANT_PATCH.sql` | `2d4aecdafb41f980e7d94fd5248fd4855ce0a95637ece12dcaf43d7deeab3627` |
| `KMO_BK01_PREDICATE_GRANT_ROLLBACK.sql` | `98abdfbabe40629021b134dcdcb1f364269be3d7b3a3408322b85882e22a8306` |
| `KMO_BK01_BASELINE.sql` | `f4109341fbb8285f2f2733ef6068a5712c4db2d3ce36433ec94a55822dcbfebc` |
| `KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql` | `b78ab6c46adfe7f698363953381d7aa1b925de66a0fcde75bfe365baa7a2afde` |
| `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql` | `755b3a72cb68e3960ceeab671b4f38a0694e91ddc7921bb71b90ff66bfefb2af` |
| `KMO_SCHEMA_CONTRACT.md` (LOCKED) | `7189617800bd2165657197318ead8b98ef624dc822dd8744d07c8f9059f9d798` |
| `KMO_EXTENSION_DESIGN.md` (LOCKED) | `97eeaae32f3ec9b8625f4326ee440a393f90e85c973357e400b96f07cff4131c` |

All line numbers below are line numbers in the **current working tree**, which for the four WU01
files is identical to the committed revision (verified clean).

---

## 1. DEPENDENCY CLOSURE

### 1.1 Object-by-object closure table

Every schema-qualified object referenced by `KMO_BK01_INTAKE_WORK_STATE_PATCH.sql`:

| Referenced object | Kind | Referenced at | Guaranteed to exist by | Status |
|---|---|---|---|---|
| `gen_random_uuid()` | function | patch:102, patch:237 | `KMO_BK01_BASELINE.sql:21` `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`; PG13+ also ships it in `pg_catalog` | **CLOSED** |
| `pgcrypto` | extension | (implicit, via `gen_random_uuid`) | `KMO_BK01_BASELINE.sql:21` | **CLOSED — enabled** |
| `btree_gist` | extension | not referenced by the patch; referenced by baseline | `KMO_BK01_BASELINE.sql:22` | **CLOSED (not needed by this patch)** |
| `uuid-ossp` / `uuid_generate_v4()` | extension / function | **NOT referenced by any WU01 file** | not enabled in `kmo-baseline/` (`grep -rn "CREATE EXTENSION" *.sql` → only baseline:21 pgcrypto, baseline:22 btree_gist) | **NOT REQUIRED by this patch** |
| schema `kmo_booking` | schema | patch:65,101,160,211,236,367-371 | `KMO_BK01_BASELINE.sql:28` | **CLOSED** |
| schema `local_service` | schema | patch:66,296,344,346 | `KMO_BK01_BASELINE.sql:27` | **CLOSED** |
| schema `pg_catalog` | schema | patch:119,183,253,300 | PG built-in | **CLOSED** |
| `local_service.shops(id)` | table + PK | patch:66,103,162,213 | `KMO_BK01_BASELINE.sql:36-53`, PK at :37 | **CLOSED** |
| `local_service.services(id)` | table + PK | patch:104 | `KMO_BK01_BASELINE.sql:63-68`, PK at :64 | **CLOSED** |
| `local_service.bookings(id)` | table + PK | patch:161,212,238 | `KMO_BK01_BASELINE.sql:82-100`, PK at :83 | **CLOSED** |
| `local_service.staff_schedules` | table (+ cols `shop_id`,`day_of_week`,`is_working_day`,`work_start`,`work_end`) | patch:344,346-348 | `KMO_BK01_BASELINE.sql:102-108`; columns verified :103 (:shop_id), :105 (:day_of_week, :is_working_day), :106 (:work_start, :work_end) | **CLOSED** |
| `local_service.shop_weekly_schedules` (+ cols `is_open`,`open_time`,`close_time`,`shop_id`,`day_of_week`) | table | patch:325-329 | `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:6-20`, columns at :8,:9,:10,:11,:12 | **CLOSED — but see D-02: outside WU01's declared input set** |
| `has_schema_privilege(text,text,text)` | function | patch:49 | PG built-in | **CLOSED** |
| role `service_role` | role | patch:49,50,356,362,386-390 | Supabase built-in (`GRANT USAGE ... TO service_role` already in baseline:33) | **CLOSED** |
| roles `anon`, `authenticated`, `PUBLIC` | role | patch:356,358,360,362,379-383 | Supabase built-in / PG built-in | **CLOSED** |
| `now()` | function | patch:70,71,106,107,166,220,221,243 | PG built-in | **CLOSED** |
| composite unique constraint for a composite FK | constraint | **NOT referenced** | — | **N/A — no composite FK in the patch** |

Objects referenced by `KMO_BK01_PREDICATE_GRANT_PATCH.sql` / `..._ROLLBACK.sql`:
`local_service.staff_schedules` (`KMO_BK01_BASELINE.sql:102-108`) and
`local_service.shop_holidays` (`KMO_BK01_BASELINE.sql:110-114`), role `anon`. Both **CLOSED**.
Both target tables carry the referenced columns: `staff_schedules.shop_id` at baseline:103,
`shop_holidays.shop_id` at baseline:111.

### 1.2 Explicitly: is `uuid-ossp`/`pgcrypto` actually enabled?

**Answer: `gen_random_uuid()` is safe; `uuid-ossp` is NOT enabled in the kmo-baseline path and is
not needed by any WU01 file.**

- The patch uses `gen_random_uuid()` at exactly two places — patch:102
  (`service_intake_policy.id`) and patch:237 (`booking_work_state_events.id`). Its dependency is
  satisfied by `KMO_BK01_BASELINE.sql:21` (`pgcrypto`). No extension assumption is left dangling by
  this patch, and no `CREATE EXTENSION` statement is issued by the patch (correctly — a schema
  patch should not silently add extensions).
- Measured baseline extension set in `supabase/kmo-baseline/`: only `pgcrypto` and `btree_gist`
  (baseline:21-22). There is **no** `uuid-ossp` in `kmo-baseline/`.
- A genuine pre-existing closure gap exists one layer down, but it is **not introduced by WU01**:
  `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:7` uses `DEFAULT uuid_generate_v4()` while that file and
  the baseline never enable `uuid-ossp`. In the repo the extension is enabled only by an *unrelated
  upstream* migration (`supabase/migrations/20260807051615_local_service_initial_schema.sql:7`
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`). That is a property of the Shop-Weekly-Schedule
  file (a pre-existing input), not of the WU01 patch. Reported as an observation, not charged to WU01.

### 1.3 Explicitly: does any composite FK assume a unique constraint that does not exist?

**No composite FK exists in the patch** — so the classic failure mode
(`ERROR: there is no unique constraint matching given keys for referenced table`) is structurally
absent. The patch declares only these FK targets: patch:66, :103, :104, :161, :162, :212, :213, :238
— every one a plain single-column `REFERENCES <table>(id)` against a declared PRIMARY KEY
(`shops.id` baseline:37; `services.id` baseline:64; `bookings.id` baseline:83).

The patch additionally **documents and correctly avoids** the trap in its own header. Its claims are
accurate as measured:

- patch:88-90 states `local_service.services` declares `id uuid PRIMARY KEY` plus
  `shop_id uuid NOT NULL REFERENCES local_service.shops(id)` at "lines 63-67". Verified: the CREATE
  spans baseline:63-68, the quoted clauses are at baseline:64. The cited range is off by one line
  at the tail (68, not 67); immaterial to the claim.
- patch:91-93 states the only unique index on `services` is
  `services_shop_creation_idempotency_key ON (shop_id, creation_idempotency_key) WHERE
  creation_idempotency_key IS NOT NULL` at "line 177". Verified exactly: baseline:177. Correct.
- Conclusion drawn by the patch is sound: `(id, shop_id)` has no unique guarantee (the PK on `id`
  alone cannot back a composite FK on `(shop_id, service_id)`), so the patch enforces
  shop/service consistency with a BEFORE-row trigger (patch:116-149) instead of a composite FK.
  This also keeps a generic `local_service.objects` object unmodified, per the LOCKED boundary
  (`KMO_SCHEMA_CONTRACT.md:32-39`, ownership of `local_service.services` is BK01, not KMO).

### 1.4 Anything referenced but never created?

None within the patch's own closure. Every table, column, function, schema, role and extension the
patch references is created by `KMO_BK01_BASELINE.sql` or by
`KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql`. No dangling reference found.

The two cross-file dependencies are explicitly declared in the patch header (patch:13-22) and both
hold: baseline objects exist; `shop_weekly_schedules` exists
(`KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:6`). One ordering hazard is recorded as **D-02** below.

---

## 2. GRANT SAFETY

### 2.1 Every GRANT/REVOKE statement in all four files, verbatim

`KMO_BK01_INTAKE_WORK_STATE_PATCH.sql`
```
355:REVOKE ALL ON FUNCTION kmo_booking.enforce_service_intake_policy_shop_scope()
356:  FROM PUBLIC, anon, authenticated, service_role;
357:REVOKE ALL ON FUNCTION kmo_booking.reject_booking_intake_mutation()
358:  FROM PUBLIC, anon, authenticated, service_role;
359:REVOKE ALL ON FUNCTION kmo_booking.reject_append_only_mutation()
360:  FROM PUBLIC, anon, authenticated, service_role;
361:REVOKE ALL ON FUNCTION local_service.enforce_staff_hours_within_shop_hours()
362:  FROM PUBLIC, anon, authenticated, service_role;
379:REVOKE ALL ON TABLE kmo_booking.intake_settings           FROM PUBLIC, anon, authenticated;
380:REVOKE ALL ON TABLE kmo_booking.service_intake_policy     FROM PUBLIC, anon, authenticated;
381:REVOKE ALL ON TABLE kmo_booking.booking_intake            FROM PUBLIC, anon, authenticated;
382:REVOKE ALL ON TABLE kmo_booking.booking_work_state        FROM PUBLIC, anon, authenticated;
383:REVOKE ALL ON TABLE kmo_booking.booking_work_state_events FROM PUBLIC, anon, authenticated;
386:GRANT SELECT, INSERT, UPDATE ON kmo_booking.intake_settings     TO service_role;
387:GRANT SELECT, INSERT, UPDATE, DELETE ON kmo_booking.service_intake_policy TO service_role;
388:GRANT SELECT, INSERT ON kmo_booking.booking_intake             TO service_role;
389:GRANT SELECT, INSERT, UPDATE ON kmo_booking.booking_work_state  TO service_role;
390:GRANT SELECT, INSERT ON kmo_booking.booking_work_state_events   TO service_role;
```
plus the conditional one inside the DO block:
```
49:  IF NOT has_schema_privilege('service_role', 'kmo_booking', 'USAGE') THEN
50:    EXECUTE 'GRANT USAGE ON SCHEMA kmo_booking TO service_role';
```

`KMO_BK01_INTAKE_WORK_STATE_ROLLBACK.sql` — **zero** GRANT/REVOKE statements
(`grep -E "^(GRANT|REVOKE)"` → no matches). It is pure DROP; it does not revoke schema USAGE, and
says so deliberately at rollback:31-36.

`KMO_BK01_PREDICATE_GRANT_PATCH.sql`
```
28:GRANT SELECT (shop_id) ON local_service.staff_schedules TO anon;
29:GRANT SELECT (shop_id) ON local_service.shop_holidays TO anon;
```

`KMO_BK01_PREDICATE_GRANT_ROLLBACK.sql`
```
22:REVOKE SELECT (shop_id) ON local_service.staff_schedules FROM anon;
23:REVOKE SELECT (shop_id) ON local_service.shop_holidays FROM anon;
```

### 2.2 Proven: nothing is granted to anon/authenticated on the new `kmo_booking` tables

- Each of the five new tables is created inside schema `kmo_booking` (patch:65, :101, :160, :211,
  :236). Schema USAGE is granted only to `service_role` — baseline:33
  (`GRANT USAGE ON SCHEMA kmo_booking, kmo_bridge TO service_role;`); `anon`/`authenticated` get
  USAGE only on `local_service` (baseline:32). The patch's DO block (patch:47-53) can only re-issue
  USAGE to `service_role`; it contains no other GRANT (patch:50 is the sole EXECUTE string).
- The only TABLE grants in the patch name `service_role` as grantee (patch:386-390). There is **no**
  `TO anon` and **no** `TO authenticated` anywhere in the patch — proven by grep: the only
  `anon`/`authenticated` occurrences in that file are on the *grantee-list of REVOKE* statements
  (patch:356,358,360,362,379-383).
- Positive revoke is issued first for all five tables (patch:379-383), which also removes the
  PostgreSQL default table ACL for the creator role, and `PUBLIC` never holds table privileges by
  default. Net effect on `anon`/`authenticated` for these five tables: **no privilege**.

### 2.3 Proven: the only anon privilege added anywhere is the two column-level `GRANT SELECT (shop_id)`

- `KMO_BK01_INTAKE_WORK_STATE_ROLLBACK.sql`: no GRANT at all.
- `KMO_BK01_INTAKE_WORK_STATE_PATCH.sql`: no GRANT to `anon`; the patch only *removes* anon-facing
  access.
- `KMO_BK01_PREDICATE_GRANT_PATCH.sql`: exactly two statements, both `GRANT SELECT (shop_id)` —
  column-scoped, on two pre-existing tables, to `anon` only (lines 28, 29). Confirmed by grep across
  all four files: the only `GRANT` lines naming `anon` are 28 and 29 of this one file.

**No table-wide SELECT is granted to anon/authenticated anywhere in the four files.** All four
`GRANT` forms are column-scoped (`GRANT SELECT, INSERT, UPDATE ON <table> TO service_role` grants
table-level privilege but only to `service_role`). No `GRANT SELECT ON <table> TO anon/authenticated`
exists in any of the four files.

**No write privilege is granted to anon/authenticated anywhere.** Grep for
`GRANT (ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)` co-occurring with
`anon|authenticated` in the four files returns nothing. The predicate-grant patch explicitly states
this at its lines 19-21, and the file content matches the claim. This also holds for the baseline as
a whole: grep of `KMO_BK01_BASELINE.sql` for `GRANT (ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|
TRIGGER) ... anon|authenticated` returns **no matches** — there is no pre-existing browser write
path on these tables for the new grant to widen.

### 2.4 `service_role` privileges are column/table-narrow as intended

| Table | Granted to `service_role` | Narrowing rationale |
|---|---|---|
| `intake_settings` | SELECT, INSERT, UPDATE (patch:386) | no DELETE — config rows are updated, never deleted |
| `service_intake_policy` | SELECT, INSERT, UPDATE, DELETE (patch:387) | DELETE is intentional: optional per-service override rows are removable |
| `booking_intake` | SELECT, INSERT (patch:388) | UPDATE/DELETE withheld — enforces the immutable-snapshot claim at the ACL layer as well as by trigger (patch:180-201) |
| `booking_work_state` | SELECT, INSERT, UPDATE (patch:389) | no DELETE — lifecycle row persists |
| `booking_work_state_events` | SELECT, INSERT (patch:390) | no UPDATE/DELETE — append-only at the ACL layer |

The grants never exceed what the table's own semantics require, and for the two "immutability" claims
(`booking_intake`, `booking_work_state_events`) the ACL *and* the trigger agree — the strongest form
of this guarantee available statically. RLS is enabled on all five (patch:367-371) and no policy is
created for `anon`/`authenticated` (patch:373-374), which matches `KMO_EXTENSION_DESIGN.md:101`
("Enable RLS on every new table even if the schema is server-only" — `kmo_booking` per
`KMO_EXTENSION_DESIGN.md:14`).

### 2.5 Supporting measurement: the predicate grant is the minimal correct change

- `KMO_BK01_BASELINE.sql:1748` grants `anon` on `staff_schedules`
  `{staff_id,day_of_week,is_working_day,work_start,work_end,break_start,break_end}` — **no**
  `shop_id`; `:1749` grants `authenticated` the same list **plus** `shop_id`. Same asymmetry for
  `shop_holidays`: `:1750` anon `{staff_id,holiday_date,reason}` (no `shop_id`), `:1751`
  authenticated includes `shop_id`. So the missing anon predicate column is real, and the patch adds
  exactly that column and nothing else — verified against the patch's own claim at lines 9-16.
- Row-level access already exists for both roles: `CREATE POLICY "KMO public schedules" ...
  FOR SELECT TO anon USING(true)` (baseline:1727) and `"KMO public holidays" ... USING(true)`
  (baseline:1728). The grant therefore does not unlock any row that was not already readable by
  `anon`; it only makes the `shop_id` predicate usable.
- `shop_id` is not a new exposure class for `anon`: it is already anon-readable on
  `local_service.services` and `local_service.staff` (baseline:1745-1746).

**Finding: GRANT SAFETY is clean.** No broad grant, no browser write privilege, no RLS widening.

---

## 3. ROLLBACK BOUNDEDNESS

### 3.1 Created-object ↔ reversal pairing

| # | Object created by `..._PATCH.sql` | Created at | Reversed by `..._ROLLBACK.sql` | Line |
|---|---|---|---|---|
| 1 | `kmo_booking.intake_settings` | patch:65 | `DROP TABLE IF EXISTS kmo_booking.intake_settings;` | rollback:80 |
| 2 | `kmo_booking.service_intake_policy` | patch:101 | `DROP TABLE IF EXISTS kmo_booking.service_intake_policy;` | rollback:79 |
| 3 | `kmo_booking.intake_settings` PK (+ implicit unique index) | patch:66 | dropped with the table | rollback:80 |
| 4 | `kmo_booking.booking_intake` | patch:160 | `DROP TABLE IF EXISTS kmo_booking.booking_intake;` | rollback:78 |
| 5 | `kmo_booking.booking_work_state` | patch:211 | `DROP TABLE IF EXISTS kmo_booking.booking_work_state;` | rollback:77 |
| 6 | `kmo_booking.booking_work_state_events` | patch:236 | `DROP TABLE IF EXISTS kmo_booking.booking_work_state_events;` | rollback:76 |
| 7 | index `idx_service_intake_policy_shop` | patch:111 | dropped with its table | rollback:79 |
| 8 | index `idx_booking_intake_shop` | patch:169 | dropped with its table | rollback:78 |
| 9 | index `idx_booking_work_state_shop_state` | patch:224 | dropped with its table | rollback:77 |
| 10 | index `idx_booking_work_state_events_booking` | patch:246 | dropped with its table | rollback:76 |
| 11 | constraint `UNIQUE (service_id)` on `service_intake_policy` | patch:108 | dropped with its table | rollback:79 |
| 12 | CHECK constraints (patch:67, :68, :105, :163, :164, :215) | as listed | dropped with their tables | rollback:76-80 |
| 13 | trigger `trg_enforce_service_intake_policy_shop_scope` | patch:147-149 | `DROP TRIGGER IF EXISTS ... ON kmo_booking.service_intake_policy;` | rollback:62-63 |
| 14 | function `kmo_booking.enforce_service_intake_policy_shop_scope()` | patch:116-143 | `DROP FUNCTION IF EXISTS ...;` | rollback:64 |
| 15 | trigger `trg_reject_booking_intake_mutation` | patch:199-201 | `DROP TRIGGER IF EXISTS ... ON kmo_booking.booking_intake;` | rollback:70-71 |
| 16 | function `kmo_booking.reject_booking_intake_mutation()` | patch:180-196 | `DROP FUNCTION IF EXISTS ...;` | rollback:72 |
| 17 | trigger `trg_reject_work_state_event_mutation` | patch:266-268 | `DROP TRIGGER IF EXISTS ... ON kmo_booking.booking_work_state_events;` | rollback:66-67 |
| 18 | function `kmo_booking.reject_append_only_mutation()` | patch:250-263 | `DROP FUNCTION IF EXISTS ...;` | rollback:68 |
| 19 | trigger `trg_enforce_staff_hours_within_shop_hours` | patch:345-348 | `DROP TRIGGER IF EXISTS ... ON local_service.staff_schedules;` | rollback:57-58 |
| 20 | function `local_service.enforce_staff_hours_within_shop_hours()` | patch:296-342 | `DROP FUNCTION IF EXISTS ...;` | rollback:59 |
| 21 | `ENABLE ROW LEVEL SECURITY` ×5 | patch:367-371 | dropped with their tables (RLS state is a table property) | rollback:76-80 |
| 22 | `COMMENT ON TABLE` ×2 | patch:74-77, :172-175 | dropped with their tables | rollback:80, :78 |
| 23 | table/function ACLs (patch:355-362, :379-390) | as listed | dropped with their tables/functions | rollback:76-80, :64, :68, :72, :59 |
| 24 | conditional `GRANT USAGE ON SCHEMA kmo_booking` | patch:50 | **NOT reversed — deliberately, and only if the patch created it** | rollback:31-36 |

**Object created but NOT reversed: none found** (item 24 is disclosed, reasoned and privilege-neutral
— see 3.3).

**Rollback statement removing something the patch did not create: none found.** Every DROP in the
rollback targets a patch:created trigger, function or table. Verified by grep of the rollback's DROP
targets against the patch's CREATE targets.

### 3.2 Dependency ordering is correct

The rollback drops each guard **trigger before the function it calls**, and each function before its
table drops — rollback:57-59 (trigger → function), :62-64, :66-68, :70-72, then tables at :76-80.
Dropping in this order avoids `2BP01 dependent objects still exist`. No `DROP ... CASCADE` is used
anywhere in the rollback, so an unexpected dependent object would abort the transaction
(rollback:54-82 is a single `BEGIN ... COMMIT`) rather than silently cascade — the correct fail-closed
choice.

### 3.3 Disclosed non-reversal is bounded and privilege-neutral

Rollback:31-36 declines to revoke `GRANT USAGE ON SCHEMA kmo_booking TO service_role` because
provenance is not determinable from DDL alone. The reasoning is correct as a matter of PostgreSQL
semantics and the outcome is bounded:

- If the baseline was applied first (the declared precondition, rollback:6-7), baseline:33 created
  that USAGE and the patch's DO block (patch:47-53) was a no-op — `has_schema_privilege('service_role',
  'kmo_booking','USAGE')` is TRUE, so the `EXECUTE` at patch:50 never ran. The patch added nothing,
  and correctly removes nothing.
- If the patch were applied on a database without baseline:33, the patch would have created that
  USAGE and the rollback would not remove it. The residual is `USAGE` on a schema that then contains
  no tables at all (all five are dropped), so it grants no reachable privilege. This is a true
  statement, verified by the rollback's DROP list, not an assumption.

---

## 4. PROTECTED AUTHORITY

### 4.1 `public.orders`, `public.production_allocations`, `public.bookings`, canonical BK01

Grep across all four WU01 files for
`public\.(orders|production_allocations|bookings)` (case-insensitive) returns **exactly one match, in
a comment**:

```
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:209:--    order/production truth stays in public.orders / public.production_allocations.
```

That line is inside a comment block (patch:203-210), is descriptive only, and issues no DDL or DML.
The three other files contain **zero** references to `public.*` (matched by the same grep returning
no hits for them).

- **No DDL touching `public.orders` / `public.production_allocations` / `public.bookings`: proven.**
  Every DDL target in the patch is schema-qualified: `kmo_booking.*` (patch:65, :101, :111, :160,
  :169, :211, :224, :236, :246, :367-371, :379-390) or `local_service.*` (patch:296, :344-346, :361).
  No unqualified DDL statement exists.
- **No DML touching them: proven.** Grep for statement-initial `INSERT|UPDATE|DELETE|TRUNCATE`
  (case-insensitive, anchored) across all four files returns only column identifiers
  (`updated_by`, `updated_at` at patch:69, :71, :107, :221) — **zero** DML statements. This matches
  the patch header claim at patch:32-33 that no default row is ever inserted, which is verified: the
  absence of any `INSERT` means the fail-closed "missing row = capacity unavailable" contract cannot
  be silently defeated by a seed row from this file.
- **No modification of canonical BK01 objects.** Canonical BK01 lives at
  `D:\AI-Workspace\projects\saas-product-hub\products\booking` (`bk01-pilot/AGENTS.md`, canonical
  boundary). That path was not opened by this unit. Within the qualified files, the only
  non-`kmo_booking` object touched is a trigger and a function on the pre-existing
  `local_service.staff_schedules` (patch:296-348), which `KMO_SCHEMA_CONTRACT.md:36` classifies as
  BK01-owned *support* for time-slot availability — the patch adds no column, index, constraint or
  table to it.
- **`KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql` is not duplicated, modified or weakened.** The patch's
  claim at lines 21-22 and 292-294 is verified by measurement: the hardening file's objects are
  `local_service.ensure_shop_weekly_schedule_rows()` (:5), `trg_ensure_shop_weekly_schedule_rows`
  (:20-23), `local_service.enforce_shop_weekly_booking_hours()` (:30),
  `trg_enforce_shop_weekly_booking_hours` (:125-128), `local_service.upsert_staff_weekly_schedule
  (uuid,jsonb)` (:63), and the grants at :164-167. Repo-wide grep for the patch's four new
  function/trigger names returns hits **only** inside the two WU01 files — no name collision with the
  hardening file, so the patch does not overwrite any hardening object.
- A genuine **stale-comment** mismatch on the hardening file exists and is recorded as D-04.

### 4.2 No KMO-only column added to `local_service.shops` / `services` / `bookings`

**Proven.** The complete list of `ALTER TABLE` statements in all four files:
```
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:367:ALTER TABLE kmo_booking.intake_settings           ENABLE ROW LEVEL SECURITY;
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:368:ALTER TABLE kmo_booking.service_intake_policy     ENABLE ROW LEVEL SECURITY;
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:369:ALTER TABLE kmo_booking.booking_intake            ENABLE ROW LEVEL SECURITY;
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:370:ALTER TABLE kmo_booking.booking_work_state        ENABLE ROW LEVEL SECURITY;
KMO_BK01_INTAKE_WORK_STATE_PATCH.sql:371:ALTER TABLE kmo_booking.booking_work_state_events ENABLE ROW LEVEL SECURITY;
```
There is **no `ADD COLUMN`** anywhere in the four files (the only matches for an
insert/update/delete-shaped grep are the identifiers listed in 4.1). No `ALTER TABLE
local_service.shops|services|bookings` statement exists. This satisfies
`KMO_SCHEMA_CONTRACT.md:95` ("No FK or schema change may force existing KMO rows to satisfy BK01
assumptions") and `KMO_EXTENSION_DESIGN.md:114` ("new schemas/tables do not modify existing KMO
production tables") for the static content of these files.

---

## 5. SEMANTIC RISKS

### D-01 — HIGH — append-only DELETE guard aborts legitimate `ON DELETE CASCADE` deletes and loses audit rows

**Defect.** `kmo_booking.booking_work_state_events` declares an append-only guard that rejects DELETE
(patch:266-268, guard body patch:256-260), while its own FK to `local_service.bookings` is
`ON DELETE CASCADE` (patch:238). PostgreSQL fires `BEFORE DELETE` row triggers on cascaded deletes
before the delete action. Deleting a `local_service.bookings` row therefore cascades a DELETE into
`booking_work_state_events`, which the guard turns into
`RAISE EXCEPTION ... 'BOOKING_WORK_STATE_EVENTS_APPEND_ONLY'` (patch:257-259). The cascade aborts,
and because the whole delete is one transaction, **deleting a booking that has any work-state event
becomes impossible.** The booking-side deletion can only succeed if the event rows are deleted first
— which the same trigger forbids.

Severity is HIGH, not MEDIUM, for three measured reasons:

1. **Silent audit loss / contract contradiction.** If the cascade is ever allowed to proceed (e.g. a
   future unit adds an exemption, or a superuser disables the trigger to clear a stuck delete), the
   `booking_id ... ON DELETE CASCADE` at patch:238 means those event rows are removed, not preserved.
   That directly contradicts the file's own stated purpose at patch:228-234 — "an audit record must
   survive independently of later shop-row changes" — and the rollback's loss warning at
   rollback:46-49, which treats this table as history worth warning about.
2. **The guard cannot distinguish a legitimate cascade from an attack**, so it converts an
   authorization question into an availability failure on the bookings side.
3. **Nothing in the file records that booking deletion is prohibited.** The guard's message speaks
   only about the events table.

Exact lines: patch:238 (the FK), patch:256-260 (the guard), patch:266-268 (the trigger).
The file discloses the *adjacent* TRUNCATE scope at patch:230-234, but not this DELETE/CASCADE
interaction.

Note for the remediating unit: this is a decision, not a one-line fix — a guard that must both block
hostile DELETEs and permit an authorized cascaded delete needs an explicit signal (e.g. a
transaction-local flag set by the authorized path, or `BEFORE DELETE` trigger ordering) and must be
decided against whether BK01 bookings are ever hard-deleted at all. No fix is proposed here; that is
out of this unit's scope.

### D-02 — MEDIUM — undeclared cross-patch apply-order dependency on the shop-weekly patch: the section-E invariant can be dead-on-arrival

**Defect.** The section-E staff-hours invariant reads `local_service.shop_weekly_schedules`
(patch:325-329) and **fails closed** — a working day with no shop-weekly row raises
`STAFF_HOURS_OUTSIDE_SHOP_HOURS` (patch:331-338). That table is created by a *different* patch,
`KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:6`. Because patch:327-329 is a static reference resolved at
trigger execution, and `CREATE TRIGGER` does not validate the referenced table, the WU01 patch would
**apply cleanly on a database that never had the shop-weekly patch applied**, installing a trigger
that raises on every insert of a working-day staff row. Silent, fail-closed, and not detectable from
the WU01 apply result.

The mitigation exists but is partial. The patch's own input list (patch:13-22) names only
`KMO_BK01_BASELINE.sql` and `KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql`; the shop-weekly file is cited
only in an *inline* comment at patch:18-20, not in the declared `Dependency:` block. Contrast the
baseline and hardening entries, both of which are in the dependency block and both of which are
genuine (verified). `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:1-3` also declares no target DB and no
predecessor. The two LOCKED docs do not list `shop_weekly_schedules` in the authority matrix at all
(`KMO_SCHEMA_CONTRACT.md:26-41` has no row for it), so the invariant's source of truth is not
pinned by either LOCKED document — contradicting `KMO_EXTENSION_DESIGN.md:111`
("dependency closure for every included table/RPC/trigger/policy") and `:107-108`.

Exact lines: patch:13-22 (dependency block), patch:18-20 (inline comment naming the file), patch:325-338
(the fail-closed read), `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:1-6`.

**The patch's substantive choice is nevertheless correct on the evidence:** baseline `shops` has no
open/close columns (patch:276-279 claim "lines 36-53, no open/close columns" — verified: the table
spans baseline:36-53 and grep for `open_time|close_time` in `KMO_BK01_BASELINE.sql` returns **no
matches**). So the shop-weekly model is the only shop-hours source that exists, and the patch's
"otherwise" branch was correctly taken. The defect is the declaration/ordering, not the source choice.

### D-03 — MEDIUM — audit `to_state`/`from_state` are unconstrained text; the transition vocabulary is not enforced and lives in no LOCKED artifact

**Finding.** `booking_work_state.work_state` is constrained to
`('WAITING_TO_START','IN_PROGRESS','COMPLETED')` (patch:214-215), but
`booking_work_state_events.from_state` (patch:240) and `.to_state` (patch:241) are bare `text` with
**no CHECK, no enum and no FK** to that list. Two consequences, both statically certain:

1. The audit table will happily record `to_state = 'PRODUCTION_QUEUED'` or any typo, so the audit
   trail cannot be relied on to be a faithful record of legal transitions, and no static check can
   tie the two tables' vocabularies together.
2. There is no state-transition guard at all — the patch stores state and actor/timestamps and says
   so (patch:205-207, "Transitions are performed only by owner/admin-authorized server RPC paths
   (delivered by a later unit)"). This is correctly disclosed and therefore not a defect in itself.

**On the specific question "a mismatch between the work_state CHECK list and the audit table's
to_state expectations":** for the states that *can* be written today (only the default
`WAITING_TO_START` at patch:214, since no INSERT path exists), there is **no** mismatch — the event
table is unconstrained, so no value is rejected. Cross-table vocabulary agreement is **not statically
judgeable**, because the authoritative state list appears in neither LOCKED document: grep of
`KMO_SCHEMA_CONTRACT.md` and `KMO_EXTENSION_DESIGN.md` for
`WAITING_TO_START|IN_PROGRESS|COMPLETED|work_state|to_state|from_state` returns **zero matches**.
`KMO_EXTENSION_DESIGN.md:26-33` assigns KMO-extension fields but does not define this lifecycle.
Recommendation for the reviewer: the state vocabulary and the transition matrix should be pinned in a
LOCKED artifact (or as a shared CHECK/enum) before the later RPC unit lands, since that unit will be
written against whichever source exists first. Reported as a risk, not as a pass/fail item, because
it depends on an artifact outside this unit's input set.

### D-04 — LOW — stale citation: the hardening file is dated 2026-09-09, but section E's cited "already enforced" behaviour is 2026-09-24 behaviour

**Defect.** Patch:280-285 justifies the section-E source by asserting that the hardening patch
"fail-closes every booking against `local_service.shop_weekly_schedules`
(`trg_enforce_shop_weekly_booking_hours`)" and patch:22 describes the hardening file as providing
"weekly fail-closed triggers". Measured, the hardening file's trigger function does **not** fail
closed on a missing weekly row: `KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql:48-50` is

```
IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_WEEKLY_SCHEDULE_NOT_CONFIGURED';
```

That version *does* fail closed, so the claim happens to hold — but the **same function name** is
redefined by the later `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:93-124`, and *that* version returns
`NEW` on a missing row (`:110-112`), i.e. does **not** fail closed. `CREATE OR REPLACE FUNCTION` in
the later file (dated 2026-09-09, `:2`) supersedes the hardening definition. So the guarantee the
patch relies on is delivered by the *shop-weekly* file, not by the hardening file the patch names as
its dependency for it — the dependency citation and the section-E rationale point at the wrong
predecessor for the property being claimed.

This is LOW because the *behaviour* the patch needs (fail-closed staff hours against the weekly
table) is delivered by section E itself (patch:331-338) and does not depend on the booking-side
trigger's disposition. It matters because a reader following the patch's stated dependency chain
would audit the wrong file for the invariant's basis.

Exact lines: patch:22, patch:280-285 (the claim);
`KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql:48-50` (fail-closed version);
`KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:2, :93, :110-112` (superseding non-fail-closed version).
Both files are pre-existing inputs, not WU01 outputs.

### D-05 — LOW / informational — the intake rollback is not re-runnable; `DROP TRIGGER ... ON <missing table>` raises 42P01

`DROP TRIGGER IF EXISTS <name> ON <table>` tolerates a missing *trigger*, but **not** a missing
*table* — the statement raises `42P01 relation does not exist`. The intake rollback issues such
statements at rollback:57-58, :62-63, :66-67, :70-71 and drops the tables at :76-80. Running the
intake rollback twice therefore fails on the second run (first DROP TRIGGER, since
`local_service.staff_schedules` still exists but `kmo_booking.service_intake_policy` and its
siblings do not — the failure lands at rollback:62-63). This is **not** a boundedness defect: the
file declares its precondition explicitly at rollback:6-7 ("apply only against a KMO state that has
`KMO_BK01_INTAKE_WORK_STATE_PATCH.sql` applied"), the whole file is one transaction
(rollback:54-82) so a failing re-run leaves no partial state, and the predicate-grant rollback does
**not** share this property (its `REVOKE` at :22-23 is a genuine no-op when the grant is absent — the
claim at `KMO_BK01_PREDICATE_GRANT_ROLLBACK.sql:16` is correct PostgreSQL semantics). Recorded so
an operator does not discover it during an LR-08 rehearsal.

### 5.1 Checklist items that returned clean

- **Idempotency of the patch (no statement errors on a second run): CLEAN.** `CREATE TABLE IF NOT
  EXISTS` (:65, :101, :160, :211, :236); `CREATE INDEX IF NOT EXISTS` (:111, :169, :224, :246);
  `CREATE OR REPLACE FUNCTION` (:116, :180, :250, :296); `DROP TRIGGER IF EXISTS` immediately before
  every `CREATE TRIGGER` (:145→:147, :198→:199, :265→:266, :344→:345); `REVOKE` before `GRANT`
  (:355-362, :379-390); schema-usage grant guarded by `has_schema_privilege` (:49-51). `COMMENT ON`
  and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` are inherently re-runnable. No idempotency gap
  found in the patch or in `KMO_BK01_PREDICATE_GRANT_PATCH.sql` (grant re-run is a no-op, per its
  claim at :21).
- **CHECK constraint that cannot be satisfied: NONE FOUND.** `daily_capacity_units >= 0` (:67) admits
  0; `default_booking_units >= 1` (:68) admits 1; `intake_units >= 1` (:105, :163) admits 1;
  `policy_source IN ('service_override','shop_default')` (:164) admits both intended values; the
  `work_state` list (:215) admits its own DEFAULT (`'WAITING_TO_START'`, :214). Every constraint is
  satisfiable by at least one legal row, and no constraint is mutually unsatisfiable with another on
  the same table. No `NOT VALID` is needed or used: these are all new tables, so there is no legacy
  row to validate against.
- **Trigger that fails to reject what it claims, or rejects legitimate writes:** the
  `NOT FOUND` path in `enforce_service_intake_policy_shop_scope` (:129-133) is genuinely closed —
  `SELECT ... INTO` leaves `FOUND` false and the variables NULL on zero rows, and the branch raises.
  No NULL-flag trap exists in any of the four new trigger functions (each either raises directly or
  tests `TG_OP`/`IS DISTINCT FROM`, none relies on `IF NOT <flag>` where the flag could be NULL).
  The two "reject X" guards (patch:180-201 rejects rewrites of the four snapshot columns, correctly
  leaving the mutable `created_at` alone; patch:250-263 rejects UPDATE/DELETE) do what their comments
  claim. The one legitimate-write rejection found is **D-01**.
- **Missing-row fail-closed path that is not actually closed: NONE FOUND.** The claim at patch:58-61
  (no seed row; absence is the signal) is backed by the measured absence of any `INSERT` in the file
  (see 4.1), and `intake_settings.shop_id` being the PRIMARY KEY (:66) means at most one row per shop
  and no "empty-row" alternative state. The section-E fail-closed path is closed by construction
  (:331-338).
- **Staff-hours invariant reading a source that does not exist: source EXISTS** —
  `local_service.shop_weekly_schedules` is created at `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:6`.
  The residual risk is ordering, not existence: **D-02**. Confirmed the patch deliberately does not
  reference a non-existent `local_service.shops.open_time/close_time` (baseline `shops` has no such
  columns; verified by grep returning no matches in `KMO_BK01_BASELINE.sql`).
- **Transaction boundaries: CLEAN.** Each of the four files is one `BEGIN ... COMMIT`
  (patch:37/:392; intake rollback:54/:82; grant patch:26/:31; grant rollback:20/:25), so no partial
  state is reachable from a mid-file failure.

### 5.2 Not statically judgeable from the artifacts in this unit

1. Whether the transition vocabulary in D-03 matches the later RPC unit's expectations (that unit's
   source does not exist in this revision).
2. Whether the live KMO database's applied state matches these files. **No applied-state claim is
   made anywhere in this report**; every statement above is a statement about file content. A
   migration file in the repo is not proof it was applied.
3. Whether a runtime role can in practice execute what the grants allow — RLS policies on the
   *pre-existing* tables (`staff_schedules`, `shop_holidays`) were read here, and for the five
   *new* tables no policy exists for `anon`/`authenticated`; that part is statically closed.

---

## 6. VERDICT

Six areas, six outcomes: dependency closure **CLOSED** (no dangling reference; `gen_random_uuid`
backed by `pgcrypto` at baseline:21; no composite FK exists, and the composite-FK trap is correctly
documented and avoided); grant safety **CLEAN** (nothing granted to `anon`/`authenticated` on the new
tables; the only anon privilege added anywhere is the two column-level `GRANT SELECT (shop_id)`;
no browser write); protected authority **UNTOUCHED** (no DDL/DML on `public.orders`,
`public.production_allocations`, `public.bookings`; no `ADD COLUMN` anywhere); rollback boundedness
**BOUNDED** (all 24 created items paired, no over-broad reversal); semantic risks **5 findings**
(1 HIGH, 2 MEDIUM, 2 LOW) plus five clean checklist items.

The HIGH finding (D-01) is a real behavioural defect in the patch as written: the append-only DELETE
guard on `booking_work_state_events` sits downstream of an `ON DELETE CASCADE` from
`local_service.bookings`, so it makes a booking with any work-state event undeletable while also
converting the audit table's own FK into a silent history-loss path. It must be resolved (or the
booking-deletion prohibition explicitly decided and documented) before apply.

D-02 must also be resolved, because the patch's declared dependency block omits the file that
supplies `local_service.shop_weekly_schedules`, and applying WU01 in the declared order would install
a fail-closed section-E invariant against a table that may not exist.

Defect list, for the remediating unit: **D-01** (HIGH, patch:238 / :256-260 / :266-268),
**D-02** (MEDIUM, patch:13-22 / :325-338, `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:1-6`),
**D-03** (MEDIUM, patch:240-241 vs :214-215), **D-04** (LOW, patch:22 / :280-285,
`KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql:48-50`, `KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql:93,110-112`),
**D-05** (LOW, rollback:57-71).

This unit does not self-approve. The verdict below is the bounded recommendation of the qualifying
worker and is subject to commander verification.

LR03_WU01_QUALIFICATION: REMEDIATE
