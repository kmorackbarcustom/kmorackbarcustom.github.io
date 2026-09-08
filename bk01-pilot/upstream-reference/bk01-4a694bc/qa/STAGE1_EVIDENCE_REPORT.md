# Stage 1 Evidence Report - Booking quota/staff/top-up enforcement

Generated from local repo and dev DB checks on 2026-08-19.

## 1. What was implemented (per agent)

- AGY / quota migration: `supabase/migrations/20260819000000_quota_staff_topup_enforcement.sql` exists and has 556 lines by `(Get-Content).Count`.
- Qwen / AGY QA: `qa/quota_enforcement_test.sql` exists and has 587 lines; `qa/run_tests.sh` exists and has 57 lines; `qa/00_auth_stub.sql`, `qa/01_storage_stub.sql`, and `qa/staff_gate_manual_test.sql` are present.
- Claude integration evidence: `git show ed06fa2 --stat --format=fuller` shows commit `ed06fa2392c2c516d10926468b7171be18e0ebb0`, message `feat(quota): enforce booking/staff/top-up limits per PRICING_SPEC`, and `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## 2. Repo checks

- Dependency check: `ls node_modules/.bin/tsc` exit code 0; file present at `node_modules/.bin/tsc`.
- Branch/baseline: `git status --short --branch` returned `## main...origin/main [ahead 1]`; `git rev-list --left-right --count origin/main...HEAD` returned `0 1`.
- Admin typecheck: `npx tsc --noEmit -p apps/booking-admin/tsconfig.json` exit code 0; output only `EXIT_CODE=0`; no `error TS` lines.
- Consumer typecheck: `npx tsc --noEmit -p apps/booking-consumer/tsconfig.json` exit code 0; output only `EXIT_CODE=0`; no `error TS` lines.
- Lint: `npm run lint` exit code 1. Consumer had 0 errors / 8 warnings. Admin had 6 errors / 26 warnings.
- Lint error lines observed:
  - `apps/booking-admin/src/app/api/line/webhook/route.ts:20:17 error Unexpected any. Specify a different type`
  - `apps/booking-admin/src/app/dashboard/page.tsx:546:13 error Do not use an <a> element to navigate to /dashboard/tickets/. Use <Link />`
  - `apps/booking-admin/src/app/dashboard/tickets/[id]/page.tsx:214:5 error react-hooks/set-state-in-effect`
  - `apps/booking-admin/src/app/dashboard/tickets/new/page.tsx:108:7 error react-hooks/set-state-in-effect`
  - `apps/booking-admin/src/app/dashboard/tickets/page.tsx:166:5 error react-hooks/set-state-in-effect`
  - `apps/booking-admin/src/app/platform-admin/page.tsx:71:10 error react-hooks/set-state-in-effect`

## 3. QA test results

Command: `bash qa/run_tests.sh` against `supabase_db_wife-disposal-evidence` / `booking_qa2`.

- Exit code: 0.
- `RUN_TESTS SUMMARY`: `OVERALL: PASS`.
- QA summary from NOTICE lines: `PASS=6, FAIL=0`.
- Per-case results:
  - `T1_CONFIRM_GATE | PASS | ... BOOKING_QUOTA_EXCEEDED raised, bookings_used stayed 100`
  - `T2_TOPUP_EXPANDS | PASS | ... 100 top-up confirms ok (used=200, topup=0), #201 rejected BOOKING_QUOTA_EXCEEDED`
  - `T3_STAFF_LIMIT_ALL | PASS | ... Basic 5-limit ok, idempotency ok, Pro 10-limit ok, reactivation-gate ok`
  - `T4_HOLD_NO_QUOTA | PASS | ... hold did not consume; confirm rejected with BOOKING_QUOTA_EXCEEDED; used stayed 100`
  - `T5_TRIAL_LIMIT | PASS | ... BOOKING_QUOTA_EXCEEDED`
  - `T5_TRIAL_UNDER_LIMIT | PASS | ... 50th booking succeeded, used=50 limit=50`

## 4. Migration validation

2a. Tier limits match pricing docs: PASS.

- Migration lines 31-58 define `get_tier_limits(text)` as Basic `(100,5,0)`, Pro `(500,10,100)`, and fallback/free trial `(50,5,10)`.
- `docs/business/PRICING_SPEC.md` lines 14-20 specify Free Trial 50 bookings, 5 staff, 10 auto slip checks.
- `docs/business/PRICING_SPEC.md` lines 30-31 specify Basic 100 bookings/month and 5 staff; line 36 excludes auto slip automation.
- `docs/business/PRICING_SPEC.md` lines 45-50 specify Pro 500 bookings/month, 10 staff, 100 auto slip checks/month.
- Live DB query returned:
  - `basic_490 | 100 | 5 | 0`
  - `free_trial | 50 | 5 | 10`
  - `pro_990 | 500 | 10 | 100`

2b. `entitlement_usage` columns are consistent: PASS.

- Migration lines 10-18 create `shop_id`, `bookings_used`, `bookings_topup_balance`, `auto_slip_used`, `auto_slip_topup_balance`, `period_end`, and `updated_at`.
- `ensure_entitlement_row` references those columns at lines 81-148.
- `enforce_booking_quota` references `bookings_used` and `bookings_topup_balance` at lines 170-207.
- `apply_topup` references top-up balance columns at lines 406-439.
- `get_entitlement_usage` returns usage/limits at lines 482-525.
- Live `information_schema.columns` query showed all referenced columns on `local_service.entitlement_usage`.

2c. Booking trigger target is consistent: PASS.

- Migration lines 222-226 creates `trg_enforce_booking_quota` on `local_service.bookings`.
- Initial schema lines 75-86 create `local_service.bookings` with `shop_id` and `status`.
- Product rules migration lines 41-45 updates the status check to include `hold`, `pending_review`, `confirmed`, `completed`, `cancelled`, `no_show`, and `expired`.
- Live DB `information_schema.columns` showed `bookings.shop_id` and `bookings.status`; `bookings_status_check` includes the expected statuses.

2d. Staff RPC references are consistent: PASS.

- Migration lines 232-315 implement `create_staff`; lines 321-389 implement `set_staff_active`.
- `staff.shop_id` and `staff.is_active` exist in initial schema lines 52-59.
- `staff.creation_idempotency_key` is added in `20260807174438_phase_e3_1_services_staff_authorization.sql` lines 6-15.
- `is_shop_owner(uuid)` is defined in `20260807174438_phase_e3_1_services_staff_authorization.sql` lines 37-50.
- Live DB columns query showed `staff.shop_id`, `staff.is_active`, and `staff.creation_idempotency_key`.

2e. Top-up/admin references are consistent: PASS.

- `apply_topup`, `platform_admin_add_topup`, and `get_entitlement_usage` call `auth.uid()`, `is_shop_owner`, `is_platform_admin`, and `subscriptions.plan` at migration lines 395-530.
- `is_platform_admin()` is defined in `20260813000000_platform_admin_authorization.sql` lines 18-32.
- `subscriptions.plan` exists in `20260809000000_phase_e4_1_subscriptions_schema.sql` lines 7-16.
- Live DB object query returned the expected procedures for `apply_topup`, `platform_admin_add_topup`, `get_entitlement_usage`, `is_shop_owner`, and `is_platform_admin`.

2f. Security posture: PASS for the new quota objects.

- Migration lines 22-25 enable RLS on `entitlement_usage`, revoke `PUBLIC/anon/authenticated`, and grant table access to `service_role`.
- Migration lines 41-42, 73-74, 166-167, 240-241, 327-328, 402-403, 454-455, and 478-479 make the new functions `SECURITY DEFINER` with `SET search_path = pg_catalog, local_service`.
- Live `pg_class` query returned `relrowsecurity = t` and ACL `{postgres=...,service_role=...}` for `entitlement_usage`.
- Live `pg_proc` query returned `security_definer = t` and `proconfig = {"search_path=pg_catalog, local_service"}` for all checked functions.
- Live `information_schema.routine_privileges` showed EXECUTE for `authenticated` on RPC/helper functions and no `anon` / `service_role` EXECUTE rows for the checked RPCs.

Live object existence check:

- `to_regclass('local_service.entitlement_usage')` returned `local_service.entitlement_usage`.
- `to_regprocedure(...)` returned all expected new routines: `get_tier_limits`, `ensure_entitlement_row`, `enforce_booking_quota`, `create_staff`, `set_staff_active`, `apply_topup`, `platform_admin_add_topup`, and `get_entitlement_usage`.

## 5. Re-confirm-after-cancel risk verdict

Verdict: not a real persisted double-count bug in the current repo/DB behavior.

Reasoning from source:

- `PRODUCT_RULES_V1.md` lines 36-38 say `confirmed` counts quota and `cancelled` remains counted.
- `PRODUCT_RULES_V1.md` lines 237-242 say quota counts when booking enters `confirmed`, cancellation does not refund, and top-up is consumed after base quota.
- The quota trigger condition in migration lines 174-175 would attempt to count a transition where `NEW.status='confirmed'` and `OLD.status='cancelled'`.
- However, product rules migration lines 154-180 define `enforce_booking_status_transition()` and make `completed`, `cancelled`, `no_show`, and `expired` terminal states.
- Admin booking mutation RPCs are limited: `approve_booking_deposit` updates only `pending_review/submitted -> confirmed/verified` at `20260807165328_phase_e2_admin_booking_actions.sql` lines 49-59; `cancel_booking` only cancels active bookings at lines 113-125.
- Frontend search found `apps/booking-admin/src/lib/admin-service.ts` only calls `approve_booking_deposit` at lines 520-525 and `cancel_booking` at lines 537-543. `apps/booking-admin/src/app/dashboard/page.tsx` shows an approve button only for `pending_review` at lines 726-734 and cancel hidden for `cancelled/completed/expired` at lines 736-748.
- Consumer code only calls `create_booking_hold` and `submit_deposit_slip` at `apps/booking-consumer/src/lib/booking-service.ts` lines 156-185.

Empirical ad-hoc DB proof:

- A throwaway shop/booking test ran in `booking_qa2`, then cleaned up. Cleanup verification query returned `leftover_stage1_reconfirm_shops = 0`.
- Output:
  - `STAGE1_RECONFIRM_TEST before=1, after_cancel=1, after_reconfirm_attempt=1, final_status=cancelled, error=Terminal state cancelled cannot be transitioned to confirmed`
  - `EXIT_CODE=0`
- Because the attempted `cancelled -> confirmed` update errors and rolls back the trigger side effect, `bookings_used` stays `1`.

## 6. Deliverables integration

- Migration present: `supabase/migrations/20260819000000_quota_staff_topup_enforcement.sql`.
- QA suite present: `qa/quota_enforcement_test.sql`, `qa/run_tests.sh`, `qa/00_auth_stub.sql`, `qa/01_storage_stub.sql`, `qa/staff_gate_manual_test.sql`.
- Commit integration: `git show ed06fa2 --stat --format=fuller` shows the migration and QA files in commit `ed06fa2392c2c516d10926468b7171be18e0ebb0`, with 7 files changed and 1476 insertions.
- Git cleanliness before report write: `git status --porcelain` returned no output.
- Tracked secret scan: `git ls-files | grep -iE '\.(env|secrets)'` equivalent in PowerShell returned only `.env.example`; no tracked `.env.local` or `.secrets`.

## 7. Overall Stage 1 verdict: FAIL

The quota/staff/top-up database migration and SQL QA suite validate successfully, and the re-confirm-after-cancel risk is not a real persisted double-count bug under the current status-transition model. However, the required repo check `npm run lint` fails with exit code 1 and 6 ESLint errors in `apps/booking-admin`, so the repo is not clean against the requested build/typecheck/lint/test gate.

## 8. Open items / recommendations for review

- Fix the 6 admin lint errors listed in section 2, then rerun `npm run lint`.
- After lint is clean, rerun both `npx tsc --noEmit` commands and `bash qa/run_tests.sh` to confirm the full gate remains green.
- Consider adding an explicit regression test for terminal status re-confirm attempts so future trigger/RPC changes cannot accidentally permit `cancelled -> confirmed`.
