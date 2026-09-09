# BRIEF — KMO BK01 Shop Weekly Schedule Downstream Mitigation

**Date:** 2026-09-09 (Asia/Bangkok)
**Branch:** `pilot/bk01-independent-deployment`
**Mode:** KMO downstream mitigation + upstream defect evidence

## Goal
Add a shop-level recurring weekly schedule so KMO can freely mark any weekday open/closed and configure shop hours without encoding KMO's Tuesday closure in product code.

## Source of Truth
- `AGENTS.md`
- `docs/ROADMAP-KMO-BK01-INDEPENDENT-DEPLOYMENT-TO-LIVE-2026-09-08.md`
- live KMO Supabase `xfhpwxjywqgqefbncumm`
- current Admin and Consumer source in this controlled copy
- canonical BK01 is read-only evidence only

## Allowed Scope
- KMO-controlled SQL patch + rollback evidence
- Admin data/service/UI for shop weekly schedule
- Consumer availability read path
- booking hold database guard
- tests and docs

## Forbidden Scope
- no canonical BK01 mutation
- no PromptPay/Stripe/LINE/Telegram work
- no customer cutover or DNS work
- no hardcoded Tuesday business rule
- no guessed KMO business values
## Acceptance Gates
1. Admin shows all seven weekdays at shop level.
2. Owner can independently mark any day open/closed.
3. Open days support configurable opening/closing times.
4. Closed shop day is excluded from consumer availability.
5. `create_booking_hold` rejects a request on a closed recurring weekday even if staff is otherwise working.
6. Special-date holidays continue to override weekly schedule.
7. Staff schedules remain an independent, narrower availability layer.
8. Shops with no weekly rows remain backward-compatible until explicitly configured.
9. RLS/owner-only mutation and outsider-deny evidence pass.
10. Existing legacy `public.*` objects remain unchanged.

## Evidence
- pre/post schema and public-shape fingerprints
- transaction/rollback smoke before live apply
- live KMO read/write/read-back smoke
- consumer closed-day negative test
- build/lint/test results
- upstream defect report comparing canonical BK01 behavior

## Rollback
The patch must have a deterministic rollback script or restore path before remote apply. No customer cutover depends on this patch yet.

## Stop Conditions
Stop on unexpected legacy schema drift, cross-tenant exposure, booking guard regression, or any requirement to invent KMO payment/business identity.
