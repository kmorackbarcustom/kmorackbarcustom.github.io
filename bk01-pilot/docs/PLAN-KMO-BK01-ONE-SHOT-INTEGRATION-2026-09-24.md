# PLAN — KMO BK01 ONE-SHOT INTEGRATION

Date: 2026-09-24 (Asia/Bangkok)
Decision source: `REPORT-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md` → `ONE_SHOT_INTEGRATION_FEASIBLE_WITH_GATES`
Author: Claude (Commander)
Status: PLAN ONLY — not an implementation dispatch

## 0. What this plan is

The single execution worklist for KMO Booking readiness. It absorbs D1A A–G and the Seed Pack adoption items into one coordinated package, sequenced by KMO-owned semantic slices (not upstream commit boundaries).

Precedence (effective only when this plan is `READY`): this plan sits above `BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md` for scope and sequencing. D1A §F remains the semantic authority for intake/work separation and its eight regression scenarios, imported here by reference. D1A is not dispatched separately.

Execution still needs a separate explicit implementation dispatch plus a fresh Relay/Hermes task-specific preflight (D0.5 rule).

## 1. Gates

| Gate | Blocks | Resolution |
|---|---|---|
| **OD-1** Public Portal as canonical customer entry | slice S5 only | Owner yes → S5 in package; Owner no/undecided → S5 parked, package still complete |
| **G-DB** Codex SQL/RLS review of S3 patch set | any runtime apply of S3 | Codex `PASS` on the patch + rollback files |
| **G-STAGE** existing stage authority | production apply / deploy / merge to `main` | unchanged; this plan grants none |
| OD-2 (Claim engine), OD-3 (Order vs `public.orders`) | nothing in this package | stay parked (§9) |

## 2. Source freeze (S0)

- Integration branch: `task/KMO-BK01-ONE-SHOT-INTEGRATION-<date>` created from the Domain branch tip at dispatch time (today `058fe52`). Record the exact base SHA in the first commit message.
- Dedicated worktree under `D:\AI-Workspace\runtime\worktrees\`. Never edit the Domain worktree or the seed-pack worktree.
- Seed Pack is read from `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/` at `73d7651` (or the Domain branch copy once merged). Copy-then-adapt only; no merge/cherry-pick from `Gutumrod/booking`.
- Preflight record: base SHA, `npm test` count, lint result, both app builds, list of kmo-baseline patch files and their SHA-256.

## 3. Slices

Each slice = one commit (or a small commit series with the slice id in every subject). Paths relative to `bk01-pilot/`.

### S1 — Generic Booking helpers (pure, no UI wiring)

Files:
- add `apps/booking-consumer/src/lib/booking-state.ts` — from seed `booking-r4/consumer/src/lib/booking-state.ts`; KMO change: `scheduleCount` input documented as "open weekly days that have ≥1 staff working day inside shop hours".
- add `apps/booking-consumer/src/lib/payment-instruction.ts` — from seed; KMO change: add static-QR branch `resolveStaticQrInstruction({ staticQrUrl, promptpayName, holdDepositAmount })` that is `ok` only when URL is configured (already validated `/`-relative or `https://`), `promptpay_name` is configured, and hold amount is finite > 0; no shop-name fallback anywhere.
- change `apps/booking-consumer/src/lib/promptpay.ts` → re-export `createPromptPayPayload`, `crc16CcittFalse` from `payment-instruction.ts` (single encoder owner; keeps `tests/promptpay.test.ts` valid).
- add `apps/booking-admin/src/lib/readiness.ts` — from seed; KMO keys: `profile, services, staff, shop_weekly_schedule, staff_schedule, payment, line, public_booking, intake_capacity` + informational `order` = `not_authorized`, `claim` = `not_authorized`, `production_capacity` = `kmo_owned`. `public_booking` source = `shop_public_profile.is_accepting_online_bookings` (KMO is Stripe-free; no billing input). `isShopReady` ignores informational rows but never counts them as ready.
- add `apps/booking-admin/src/lib/schedule-merge.ts` — seed file unchanged.
- tests: add `tests/booking-state.test.ts`, `tests/payment-instruction.test.ts`, `tests/readiness.test.ts`, `tests/schedule-merge.test.ts` (seed tests + KMO cases), `tests/booking-service-errors.test.ts` (read error → throw; success empty → `null`/`[]`).

Gate: `npm test`, lint, both builds green. No page imports these yet.

### S2 — KMO customer Booking truth (consumer page)

Files: `apps/booking-consumer/src/app/book/[slug]/page.tsx`, `apps/booking-consumer/messages/{th,en}.json`.
- Render one screen per `resolveBookingPageState` result; `BOOKING_DISABLED` no longer falls through to the stepper.
- Step 2: `NO_SLOT_FOR_DATE` state when every slot for the date is unavailable.
- Remove `?? shop.default_deposit_amount ?? 100` at l.146 and l.581; pre-hold card shows only `preHoldServiceDeposit()`; `null` renders "deposit confirmed after reservation" copy, never a number.
- Remove `promptpay_name || shop.name || fallbackShopName` (F-2).
- Step 3 payment block renders only from `resolvePaymentInstruction` (dynamic) or `resolveStaticQrInstruction` (static); otherwise payment-not-configured screen with **no** QR, amount, copy, download, slip picker or submit.
- Countdown = `max(0, expires_at − now)` recomputed each tick; no `900` literal; `expires_at` null or past → hold-expired screen.
- KMO contact-phone fallback copy kept.

Gate: `npm test`, lint, consumer build; **Codex checkpoint C1** (S1+S2 diff review, money/authority focus).

### S3 — Database / RPC / RLS (KMO baseline patch set)

All as new files under `supabase/kmo-baseline/`, each with a paired `_ROLLBACK.sql`. Nothing applied to any runtime inside this slice.

| Patch | Content | D1A |
|---|---|---|
| `KMO_BK01_PREDICATE_GRANT_PATCH.sql` | `GRANT SELECT (shop_id)` to `anon` on `local_service.staff_schedules` and `local_service.shop_holidays` only; assert no table-wide SELECT/write | A |
| `KMO_BK01_WEEKLY_FAIL_CLOSED_PATCH.sql` | `enforce_shop_weekly_booking_hours()` raises when the weekly row is missing (replace `RETURN NEW`); or seven-row invariant enforced atomically in `upsert_shop_weekly_schedule` + provisioning — implementer picks one and states why; create **and** reschedule paths | D |
| `KMO_BK01_STAFF_HOURS_INVARIANT_PATCH.sql` | staff schedule RPC rejects working hours outside shop weekly hours / on closed days | E |
| `KMO_BK01_INTAKE_CAPACITY_PATCH.sql` | shop-configured daily intake units (integer ≥ 0, no `DAILY_CAP=3` constant); per-booking intake units (integer ≥ 1, default 1); atomic enforcement inside `create_booking_hold` and reschedule (row lock or advisory lock keyed on `(shop_id, booking_date)`); capacity counted on `booking_date` only; `pickup_date`/duration never consume capacity | F1, F2 |
| `KMO_BK01_WORK_LIFECYCLE_PATCH.sql` | work lifecycle `WAITING_TO_START → IN_PROGRESS → COMPLETED` stored in KMO-owned extension (`kmo_booking.*`, per Gate 3), one row per booking; transitions only via authorized owner/admin RPC with actor + timestamp; completion never rewrites booking history | F3, F4 |

Design constraints: `public.*` KMO tables untouched; no universal customer key; RLS enabled on every new table; no anon policy on `kmo_booking` / `kmo_bridge`; no service-role path to browsers.

Gate: SQL applies cleanly on a disposable local/branch database from `KMO_BK01_BASELINE.sql` + existing patches; rollback returns to the prior schema dump; DB negative tests (below). **Codex checkpoint G-DB** before any runtime apply.

### S4 — Admin readiness, schedule UX, work dashboard

Files: `apps/booking-admin/src/app/dashboard/page.tsx`, `apps/booking-admin/src/lib/admin-service.ts`, `apps/booking-admin/src/i18n/messages.ts` (or its JSON source).
- Readiness panel from `computeReadiness`.
- Dirty-staff set; `loadDashboardBookings` and initial load go through `mergeServerSchedules` (fixes F-1); snapshots refreshed only for non-dirty staff.
- Dirty marker per card, "save all" = sequential per-card saves each keeping KMO failed-card rollback; `beforeunload` guard while dirty.
- Intake-capacity setting (shop units, service/booking units).
- Work dashboard: due today, past appointment not started, in progress, completed, no-show/cancel; records never disappear because the date passed; explicit transitions via S3 RPC.

Gate: tests, lint, admin build.

### S5 — Public Portal shell (**only if OD-1 = yes**)

Files: add `apps/booking-consumer/src/lib/public-portal.ts` (seed, capability source = `shop_public_profile` only; `orderEnabled`/`claimEnabled` fixed `false`, no field read); add `apps/booking-consumer/src/app/shop/[slug]/page.tsx` (Booking card only); change `apps/booking-consumer/src/app/page.tsx` redirect `/` → `/shop/<slug>`; merge `portal` i18n key only; add `tests/public-portal.test.ts` (portal cases split from seed test).
Route table after S5: `/` → `/shop/<slug>`; `/shop/[slug]` portal; `/book/[slug]` Booking (unchanged, deep links preserved); `/manage-booking` unchanged. Not created: `/order/*`, `/shop/*/claim`, `/claim/track`.

If OD-1 is not yes: skip S5 entirely; nothing else depends on it.

### S6 — Security / runtime reconciliation

- Apply S3 to a **non-production** KMO target first (dark/staging per existing Gate 5 practice); production apply only under G-STAGE.
- Verify grants/policies by catalog query (`information_schema.column_privileges`, `pg_policies`) before and after.
- Exact-value secret scan of generated artifacts; allowed-path audit.

### S7 — Proof (R4 harness adapted to KMO)

Isolated fixture shop inside the KMO project; KMO business-data fingerprint (`public.bookings`, `public.orders`, `public.production_allocations`, `public.customers`, real KMO `local_service` shop rows) before and after; LINE/Telegram/notification dispatch suppressed; fixture residue = 0 at end.

Required evidence (JSON + screenshots, 360/390 px and desktop):
1. Truthful-state matrix: every `BookingPageState`, `NO_SLOT_FOR_DATE`, hold-expired, payment-not-configured (dynamic and static).
2. Payment: no QR/amount/copy/download/slip when tuple incomplete; amount equals `holdResult.deposit_amount`.
3. Countdown equals server `expires_at`.
4. D1A §F regression scenarios 1–8 (verbatim from D1A brief), incl. concurrent-hold race not exceeding intake units.
5. Weekly missing-row fail-closed on create and reschedule; staff hours outside shop hours rejected by DB.
6. Admin: readiness rows, F-1 (edit staff A, approve a slip, edit survives), save-all with one forced failure rolls back only that card, leave guard.
7. Owner/admin allow, outsider and cross-tenant deny, rapid tenant navigation.
8. Notification/provider failure does not change Booking truth.
9. Bridge ambiguity fails closed / manual review.
10. If S5: portal shows only enabled capabilities; Order/Claim routes return 404.

Plus: `npm test`, lint, both builds, `git diff --check`, allowed-path audit.

### S8 — Codex independent QA

Fresh read-only Codex review of the final candidate SHA against this plan, D1A §F and the evidence in S7. Verdict `PASS` / `REMEDIATE` with defect package (file / defect / evidence / impact / fix).

### S9 — Bounded remediation

| Class | Examples | Route |
|---|---|---|
| Simple | copy/i18n, lint, missing test case, UI state mis-render without authority impact | builder fixes; Codex re-verifies the delta only |
| Hard | money/amount authority, capacity atomicity, RLS/grants, lifecycle transitions, tenant isolation, anything in S3 | back to plan owner (Commander) with defect package; affected slice re-reviewed in full by Codex; G-DB re-run if SQL changed |

Two failed remediation rounds on the same hard defect → stop and escalate to Owner.

### S10 — Final integration candidate

- One PR: integration branch → Domain branch `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`. Not to `main`.
- Merge only after S8 `PASS` and Commander Final Review Gate (raw evidence opened, not summary).
- Production DB apply and deploy are separate G-STAGE steps after merge.

## 4. Commit sequence

`S0 preflight record` → `S1 helpers+tests` → `S2 consumer truth` → (C1) → `S3 kmo-baseline patches+rollbacks+DB tests` → (G-DB) → `S4 admin` → `S5 portal` (conditional) → `S6/S7 evidence (docs/audit/…)` → S8 → `S9 fixes` (if any) → S10 PR.

## 5. Changed-surface map

| Surface | Files | Slice |
|---|---|---|
| Consumer helpers | `apps/booking-consumer/src/lib/{booking-state,payment-instruction,promptpay}.ts` | S1 |
| Admin helpers | `apps/booking-admin/src/lib/{readiness,schedule-merge}.ts` | S1 |
| Consumer UI | `apps/booking-consumer/src/app/book/[slug]/page.tsx`, `messages/{th,en}.json` | S2 |
| DB | `supabase/kmo-baseline/KMO_BK01_{PREDICATE_GRANT,WEEKLY_FAIL_CLOSED,STAFF_HOURS_INVARIANT,INTAKE_CAPACITY,WORK_LIFECYCLE}_{PATCH,ROLLBACK}.sql` | S3 |
| Admin UI/service | `apps/booking-admin/src/app/dashboard/page.tsx`, `src/lib/admin-service.ts`, admin i18n | S4 |
| Portal (conditional) | `apps/booking-consumer/src/lib/public-portal.ts`, `src/app/shop/[slug]/page.tsx`, `src/app/page.tsx` | S5 |
| Tests | `tests/{booking-state,payment-instruction,readiness,schedule-merge,booking-service-errors,public-portal}.test.ts` + DB negative tests under `supabase/tests/` | S1–S5 |

Anything outside this map requires a written reason in the PR.

## 6. Rollback boundaries

- S1/S2/S4/S5: revert the slice commit(s); no data impact.
- S3: each patch has a tested `_ROLLBACK.sql`; intake-capacity and work-lifecycle rollbacks must preserve existing booking rows (drop columns/tables only after export).
- Runtime: apply order predicate-grant → weekly → staff-hours → intake → lifecycle; roll back in reverse.
- S5: revert `page.tsx` redirect restores the current `/` → `/book/<slug>` entry.

## 7. Authorization boundary inside the package

Authorized by D1A (already): A–G. Added by Seed adoption within Booking scope: readiness, schedule-merge, payment/state helpers, proof harness. Conditional: S5 (OD-1). Not in package: any Order or Claim runtime, route, table, RPC or capability flag.

## 8. Verification owners

- Builder: S1–S7 evidence.
- Codex: C1, G-DB, S8 (independent, read-only).
- Commander: Final Review Gate on raw evidence before S10 merge.

## 9. Parked after the package

- Claim (all) — OD-2 + future authorization.
- Order (all), Order→Booking delegation — OD-3 + future authorization.
- Portal Order/Claim cards and routes.
- BK01 catalog module — rejected.
- BK01 generic capacity calendar — never authoritative for KMO.
- True multi-day slot occupancy beyond intake/work separation.
- Upstream feedback of KMO-ahead items to canonical BK01 (Owner Hold remains).
- Optional extraction of `load-result.ts` helper.
