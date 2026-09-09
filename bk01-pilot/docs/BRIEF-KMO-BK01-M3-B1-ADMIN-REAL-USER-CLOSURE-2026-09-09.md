# BRIEF — KMO BK01 M3 / B1 Admin Real-User Closure

**Date:** 2026-09-09 (Asia/Bangkok)
**Mode:** VERIFY FIRST / NO SOURCE CHANGE UNTIL DEFECT CLASSIFICATION
**Branch:** `pilot/bk01-independent-deployment`
**Runtime:** KMO-owned Cloudflare + KMO-owned Supabase only

## Goal
Close M3/B1 by proving the deployed KMO admin runtime works for the real KMO owner account and fails closed for unauthorized users, without changing customer routing or legacy booking pages.

## Current verified baseline
- Cloudflare dark deploy is online.
- Admin `/login` returns HTTP 200.
- Unauthenticated `/dashboard` redirects to `/login?next=/dashboard`.
- Consumer root redirects to `/book/kmo-rackbarcustom`; booking page returns HTTP 200.
- KMO tenant exists in `local_service` and Owner binding has DB-side evidence.
- `/register` is disabled and redirects to `/login`.
- PromptPay remains intentionally unset and payment flow must remain fail-closed.
- No customer cutover, cron activation, custom-domain cutover, or production notification activation is authorized in this phase.
## B1 acceptance matrix
1. Real KMO Owner can authenticate through the public Cloudflare Admin URL.
2. `/dashboard` loads the correct KMO tenant without permission, encoding, or wrong-project errors.
3. Services create/update/activate/deactivate works and persists.
4. Staff create/activate/deactivate and owner-only user-link boundary works.
5. Weekly schedule read/write persists.
6. Shop holiday create/delete persists.
7. Shop settings read/write persists without inventing PromptPay values.
8. Sign-out invalidates the admin session and subsequent dashboard access redirects to login.
9. Owner-only operations remain owner-only in the live runtime.
10. Unauthorized/outsider identity cannot read or mutate KMO tenant data.

## Evidence requirements
- Record live URL/status and redirect behavior.
- Record authenticated runtime observations without passwords, tokens, cookies, or secret values.
- Record before/after state for every mutation and restore test-only state when safe.
- Do not claim PASS from UI rendering alone when persistence/RLS behavior is relevant.
- Preserve legacy KMO booking/admin runtime and `public.*` state.

## Defect classification gate
If a failure is found, classify before editing:
- **KMO deployment/config defect:** KMO-only environment, Cloudflare, KMO baseline, branding or deployment overlay.
- **Generic BK01 defect:** reproducible product/runtime defect independent of KMO. Document and route upstream first; do not silently fork-fix in KMO.
- **External/account blocker:** credential, provider, Cloudflare/Supabase account policy, or missing owner action.
## Hard stops
- No source edit before a failing case is classified.
- No canonical WSTERA BK01 mutation in this phase.
- No Stripe runtime.
- No PromptPay recipient invention or fake fallback.
- No customer cutover or legacy-page replacement.
- No secret exposure in command output, evidence, docs, Git, screenshots, or chat.

## Execution order
1. Capture repo/runtime checkpoint and verify the phase brief exists.
2. Re-run unauthenticated public smoke and registration fail-closed checks.
3. Run real-owner login/dashboard smoke.
4. Run reversible admin CRUD persistence checks.
5. Verify logout/session behavior.
6. Verify outsider deny behavior on deployed runtime.
7. Re-check legacy routes and repo working tree.
8. Write B1 evidence/verdict. Only after verified PASS may M3 be closed and M4/payment closure be considered.

## Verdict rule
B1 is **PASS** only when all required live-runtime gates above have evidence. Any unknown credential-dependent or authorization-dependent item is `NOT VERIFIED`/`BLOCKED`, never inferred from DB simulation or source inspection alone.
