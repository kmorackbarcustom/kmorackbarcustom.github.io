# BRIEF — CODEX KMO BK01 MOBILE PILOT INDEPENDENT REVIEW

Date: 2026-09-09
Mode: **INDEPENDENT REVIEW / VERIFY FIRST / NO MUTATION**
Target repo: `D:\AI-Workspace\projects\kmorackbarcustom.github.io\bk01-pilot`
Branch: `pilot/bk01-independent-deployment`
Current HEAD at brief creation: `dd266f7825eda9295636e5d4fe1e76c18e798a50`

## Objective

Review the current KMO BK01 downstream pilot after real-owner mobile testing exposed several usability, runtime, and contract defects.
Do not trust this brief as proof. Reproduce findings from source, tests, git state, generated artifacts, and read-only runtime evidence.

Primary question:
> Is the current KMO remediation safe, internally consistent, and ready for another owner mobile test, or are there blockers that must be fixed first?

Secondary question:
> Which findings are KMO-only mitigation, which are generic BK01 product defects, and which require an upstream architectural change before general release?

## Hard boundaries

- REVIEW ONLY. Do not edit source, SQL, docs, env files, generated artifacts, or configuration.
- Do not commit, push, deploy, reset, clean, stash, checkout, or delete anything.
- Do not mutate canonical BK01.
- Do not apply migrations or RPC changes.
- Live database checks must be read-only unless a transaction is guaranteed to rollback and is genuinely necessary for proof.
- Never print secret values, access tokens, service-role keys, LINE credentials, PromptPay identifiers, or private customer data.
## Repository state to preserve

At brief creation the branch was ahead of remote by 10 commits and had intentional modified/untracked work.
Do not attempt to make the worktree clean.

Expected modified application files include:
- `apps/booking-admin/messages/en.json`
- `apps/booking-admin/messages/th.json`
- `apps/booking-admin/src/app/dashboard/page.tsx`
- `apps/booking-admin/src/lib/admin-service.ts`
- `apps/booking-consumer/messages/en.json`
- `apps/booking-consumer/messages/th.json`
- `apps/booking-consumer/src/app/book/[slug]/page.tsx`
- `apps/booking-consumer/src/lib/booking-service.ts`

Expected current remediation/evidence files include:
- `tests/shop-weekly-schedule.test.ts`
- `tests/owner-mobile-regressions.test.ts`
- `supabase/kmo-baseline/KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql`
- `supabase/kmo-baseline/KMO_BK01_SHOP_WEEKLY_SCHEDULE_ROLLBACK.sql`
- `supabase/kmo-baseline/KMO_BK01_SHOP_PROFILE_DECOUPLE_PATCH.sql`
- `supabase/kmo-baseline/KMO_BK01_SHOP_PROFILE_DECOUPLE_ROLLBACK.sql`
- `scripts/kmo-shop-profile-proof.sql`

Also preserve all pre-existing untracked roadmap/handoff/brief files. Do not add or remove them.
## Real-owner mobile findings to review

Owner reported the following from actual mobile use:

1. Recurring weekly shop closure can be changed and saved — PASS.
2. Time fields are hard to operate on mobile: typing is not practical and native picker targeting is difficult.
3. Customer booking flow could not initially be validated because configuration was incomplete.
4. Special holidays can be added and deleted — PASS.
5. Shop opening/closed days are not clearly reflected in staff schedules; saving one staff member caused unsaved edits on other staff cards to appear reset.
6. Shop profile could not be saved independently because the existing RPC required PromptPay fields.
7. Service duration only supports minutes, while real businesses may sell durations in minutes, hours, or days.
8. Numeric inputs could not be cleared cleanly because controlled numeric state forced a leading `0` until save.
9. Customer page appeared empty even after shop setup.

Do not merely confirm the UI symptoms. For each item identify:
- source-level root cause,
- runtime/data-contract root cause where applicable,
- whether the remediation is complete,
- whether regression protection exists,
- whether the issue is KMO-specific or generic BK01.

## Known runtime evidence — verify independently

KMO tenant slug: `kmo-rackbarcustom`.
Live KMO DB had 2 active services but 0 active staff at last check.
Shop-level weekly schedule has 7 rows with RLS enabled and a booking-hours enforcement trigger.
Public schema fingerprint was previously unchanged by the weekly-schedule patch.
Do not expose any payment account values while checking current state.
## Current remediation claims that require independent verification

The current downstream work claims to address these defects:

- Public consumer no longer filters Services/Staff by private `is_active` columns; RLS remains the active-record boundary.
- Shop profile save is split from payment settings through `update_shop_profile`.
- Mobile schedule time inputs accept direct typing and normalize to `HH:MM`.
- Staff schedule save no longer reloads the entire dashboard and erase other unsaved card edits.
- Staff working days are constrained by shop weekly open/closed state and opening hours.
- Service duration/price/deposit fields use editable string state so users can clear and retype values.
- Hardcoded automatic 30% deposit recalculation was removed from the service form.
- Service duration minimum/step was loosened from 15-minute increments to positive integer minutes.

Current regression suite claim:
- `27/27 PASS`
- lint: `0 errors` with pre-existing warnings
- standard Admin/Consumer Next.js production build: PASS

Do not accept those numbers without running the relevant commands yourself.

## P0 — secret/bundle deployment blocker

The most recent Admin OpenNext deployment attempt did **not deploy**.
The build completed, but an exact-value secret scan stopped the pipeline with:

`admin_server_secret_hits=4`

and the process exited non-zero before Wrangler deployment.
This is a P0 review item.
For the P0 blocker, determine safely:
- which generated artifact files matched,
- which **credential category names** matched,
- whether matches are real credential values, stale local values, placeholders, source-map contamination, or scanner false positives,
- whether any previous deployed Worker version could contain those values,
- whether `.env.local` restoration/build ordering can contaminate `.open-next`, `.next`, or cache artifacts.

Security reporting rule:
- Report only credential variable names, artifact paths, match counts, and masked fingerprints if needed.
- Never print the matching secret value.
- Do not weaken or bypass the scanner to obtain a green deployment.

Current deployed Worker versions are expected to remain the prior versions because the blocked attempt never reached deploy:
- Admin expected prior version: `14da45d6-0efa-4d7b-bf7d-cb5d82b282e2`
- Consumer expected prior version: `fe6730cc-c26c-4e4f-91d9-f4751d4e374c`

Verify this without changing deployment state.

## Review Track A — public booking / finding #9

Reproduce why the original consumer query returned `42501` for Services and Staff.
Confirm whether the current source correctly relies on RLS rather than filtering on columns not granted to anon.
Check both table privileges and RLS policies; do not solve by broadening anon column grants unless absolutely required by contract.
Confirm the customer page has an explicit truthful state for:
- services available but zero active staff,
- no available slots,
- shop closed,
- special holiday,
- loading/read failure.
Determine whether 2 active services + 0 active staff should show services while preventing progression to a false bookable slot.
## Review Track B — shop weekly schedule vs staff schedule

Inspect the new shop-level weekly schedule model and its integration with existing `staff_schedules` and `shop_holidays`.
Expected conceptual availability boundary:

`shop weekly open` AND `staff working` AND `not shop special holiday` AND `not staff holiday` AND `slot not occupied`.

Verify all relevant customer slot-generation and DB booking-write paths enforce this consistently.
Verify closed shop days cannot become bookable by adding a new staff member later.
Verify staff work start/end cannot create an effective bookable period outside shop open/close hours.
Review whether disabled/closed staff UI is only visual or actually consistent with saved data and runtime enforcement.

For the reported reset bug:
- inspect state management around saving one staff schedule,
- verify saving Staff A does not overwrite unsaved local edits for Staff B,
- verify reload behavior cannot silently replace unsaved values without warning.

Also determine whether the current UX needs dirty-state indicators or bulk-save semantics before wider release.

## Review Track C — profile/payment separation

Review `update_shop_profile` and existing `update_shop_settings` boundaries.
Required property: name/phone/address must save without requiring or mutating PromptPay.
Owner authorization must remain fail-closed and outsider calls must fail.
Verify the new profile RPC cannot alter another tenant's shop.
Verify payment fields are not accidentally cleared by profile saves.

Payment architecture is NOT in implementation scope for this review, but record recommendations for future support of:
- PromptPay recipient,
- bank transfer account metadata,
- bank-issued/static merchant QR.
Do not recommend inventing a dynamic QR payload from an ordinary bank-account number unless a verified standard/provider supports it.
## Review Track D — mobile time and numeric input UX

Review the time normalization logic for shop and staff schedules.
The owner must be able to type practical mobile forms such as `8`, `800`, `08:00`, `8:30`, and have a deterministic valid `HH:MM` result.
Check invalid values such as `25:00`, `1260`, empty required shop hours, partial break times, and start >= end.
Check that normalization does not silently convert malformed input into a different valid time.

Review all numeric service inputs for the reported leading-zero problem.
Required behavior:
- user can clear the field completely while editing,
- user can retype a number without a forced leading zero,
- save validates empty/NaN/negative values,
- deposit cannot exceed service price,
- no hidden auto-30%-deposit behavior remains.

Review mobile layout/interaction around these fields at narrow viewport assumptions.
Do not claim mobile PASS based only on desktop JSX or unit tests; identify any remaining real-device verification needed.

## Review Track E — service duration model / finding #7

Current persistence and booking engine use `duration_minutes` as a real scheduling primitive.
The request from pilot usage is to support businesses whose human-facing duration is expressed in minutes, hours, or days.

Do not approve a cosmetic unit dropdown that merely converts `1 day` to `1440 minutes` without checking booking semantics.
Determine:
- whether minutes + hours can safely remain same-day duration aliases,
- what breaks when duration spans midnight,
- whether multi-day services require date-range booking semantics,
- what schema/RPC/UI/availability changes are needed for genuine `day` support,
- whether this should be a separate generic BK01 upstream remediation.

Return a recommended model, but do not implement it.
## Review Track F — tests, DB safety, and tenant isolation

Run and inspect at minimum:
- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Do not stop at green tests. Read the assertions and identify weak tests that merely search source strings without proving behavior.
Review whether `tests/owner-mobile-regressions.test.ts` and `tests/shop-weekly-schedule.test.ts` meaningfully protect the reported defects.

For DB/security review, verify:
- new tables have RLS enabled,
- anon receives only necessary public read surface,
- authenticated users cannot directly mutate protected tables where RPC-only mutation is intended,
- RPC authorization scopes to the caller's shop,
- outsider/other-tenant access is denied,
- booking writes remain fail-closed on recurring closed days/outside shop hours,
- shop-wide special holiday enforcement remains intact,
- existing public schema is not unintentionally changed by KMO patches.

Do not reveal user IDs, emails, account numbers, tokens, or private booking data in the report.

## Review Track G — generated artifacts and deployment state

Inspect `.next`, `.open-next`, build scripts, `.env.local` handling, and Cloudflare configs.
Confirm dark-deploy safety remains intentional:
- Consumer pilot must not accidentally activate the normal five-minute notification cron.
- No custom-domain cutover is part of this review.
- No production LINE/Telegram notification activation is authorized.
- No Stripe integration is authorized for KMO.

If generated artifacts are stale or contaminated, report the exact cleanup/rebuild procedure required, but do not execute destructive cleanup unless the owner later authorizes remediation.
## Upstream comparison — read-only

Canonical BK01 path:
`D:\AI-Workspace\projects\saas-product-hub\products\booking`

Use canonical only as a read-only comparison source.
Before drawing upstream conclusions, inspect its current branch/HEAD/status and relevant migrations/source.
Do not modify canonical files.

Classify each significant issue as one of:
- `KMO_DOWNSTREAM_ONLY`
- `GENERIC_BK01_DEFECT`
- `GENERIC_BK01_PRODUCT_GAP`
- `DEPLOYMENT_OR_ENVIRONMENT_DEFECT`
- `TEST_OR_EVIDENCE_GAP`

Known candidates that must be independently checked:
- shop-level recurring weekly schedule was previously absent in canonical,
- Shop Settings / PromptPay coupling was previously present in canonical,
- multi-unit/multi-day service duration may be a broader BK01 product gap.

## Severity and release rules

Use severity:
- `P0` secret exposure, tenant escape, destructive DB risk, authentication/authorization bypass.
- `P1` booking truth can be wrong, customer can book closed/unavailable time, payment truth can be false, core customer page unusable.
- `P2` material owner UX/state loss, confusing configuration, unsupported business semantics.
- `P3` polish or low-risk maintainability issue.

A single unresolved P0 means `BLOCKED`.
An unresolved P1 normally means `REMEDIATE BEFORE OWNER RETEST`.
P2 issues may allow a targeted owner retest only if they do not corrupt booking truth or data.
Do not equate green compile/tests with release readiness.
## Required review output

Write the review to:
`D:\AI-Workspace\projects\kmorackbarcustom.github.io\bk01-pilot\docs\REVIEW-CODEX-KMO-BK01-MOBILE-PILOT-2026-09-09.md`

Do not commit the review unless the owner explicitly asks later.

The report must contain these sections:

1. `EXECUTIVE VERDICT`
   - exactly one: `PASS FOR OWNER RETEST`, `REMEDIATE BEFORE OWNER RETEST`, or `BLOCKED`.
2. `P0/P1 FINDINGS`
   - highest-risk findings first, with file/function/runtime evidence.
3. `MOBILE FINDINGS 1-9 MATRIX`
   - each owner-reported item: reproduced?, root cause, current remediation status, severity, retest needed.
4. `SECRET-SCAN ROOT CAUSE`
   - safe masked analysis of `admin_server_secret_hits=4` and whether any deployed version is at risk.
5. `DB / RLS / TENANT ISOLATION`
   - table/RPC/trigger evidence and outsider boundary.
6. `PUBLIC BOOKING CONTRACT`
   - Services/Staff/availability behavior, including zero-active-staff state.
7. `SCHEDULE CONSISTENCY`
   - shop weekly schedule, staff schedule, special holidays, booking enforcement.
8. `PROFILE / PAYMENT BOUNDARY`
   - confirm or reject the decoupling design.
9. `SERVICE DURATION ARCHITECTURE`
   - recommendation for minutes/hours/days without false support.
10. `TEST QUALITY`
   - not just pass counts; explain meaningful and weak coverage.
11. `UPSTREAM CLASSIFICATION`
   - KMO-only vs generic BK01 issues.
12. `EXACT NEXT ACTIONS`
   - ordered smallest-safe remediation sequence, with no implementation performed.
## Review protocol / stop conditions

Start by recording current branch, HEAD, `git status --short`, and diff scope.
Read `AGENTS.md`, `UPSTREAM.md`, the current KMO roadmap/closure brief, and relevant prior reports before judging intent.
Then inspect actual changed source and SQL rather than relying on documentation claims.

Safe runtime checks are allowed only when they do not change customer/business truth.
If a proof needs mutation, prefer a transaction with explicit rollback and verify cleanup afterward.
Do not use or reveal a stale/local service-role key as proof of authorization behavior.

Stop and mark `BLOCKED` immediately if you find:
- a real server credential embedded in a deployable browser/Worker artifact,
- tenant-crossing read/write access,
- an owner/admin RPC that can target another tenant without authorization,
- a path that permits booking on a shop-closed day or outside shop hours,
- a deployment command that would activate cron/notifications/cutover outside the authorized dark-pilot scope.

The purpose of this review is to challenge the remediation, not to validate the implementer's assumptions.
Evidence over green status. Runtime truth over UI appearance. Fail closed when uncertain.
