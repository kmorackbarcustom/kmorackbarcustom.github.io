# REPORT — KMO BK01 M3 / B1 Admin Real-User Closure

**Date:** 2026-09-09 (Asia/Bangkok)
**Branch:** `pilot/bk01-independent-deployment`
**Checkpoint HEAD:** `46de6031be6dbe4dce4c883dc5cbd51145370270`
**Verdict:** BLOCKED / PARTIAL PASS

## Verified PASS
- Public Admin `/login` returns HTTP 200.
- Unauthenticated `/dashboard` redirects to `/login?next=/dashboard`.
- Public Consumer root redirects to `/book/kmo-rackbarcustom`; booking page returns HTTP 200.
- `/register` is disabled and redirects to `/login`.
- KMO target project ref is `xfhpwxjywqgqefbncumm`.
- Local public anon key is valid against that project.
- Owner-role live DB proof passes for Services CRUD, Staff CRUD, Schedule CRUD, Holidays CRUD and owner data export.
- All proof mutations ran inside a transaction and were rolled back.
- Outsider authenticated-role simulation cannot read KMO shop/membership and cannot execute owner-only settings mutation.

## Live proof details
Owner DB proof verdict: `OWNER_DB_LIVE_PROOF_PASS`.
Outsider DB proof verdict: `OUTSIDER_DB_LIVE_PROOF_PASS`.
No proof service, staff, schedule, holiday or outsider fixture was persisted.
## Blocking defect — Shop Settings
`local_service.update_shop_settings(...)` requires shop phone, PromptPay number and PromptPay account name in one write.

KMO M3 requires Shop Settings read/write, but M5 is the later Payment / Deposit Closure gate and current KMO policy explicitly forbids inventing PromptPay identity.

Canonical BK01 contains the same validation, so this is classified as a generic upstream defect/contract coupling rather than a KMO-only patch target.
Evidence packet:
`docs/UPSTREAM-DEFECT-BK01-SHOP-SETTINGS-PROMPTPAY-COUPLING-2026-09-09.md`

## KMO profile source evidence
Current legacy `public.system_settings` confirms real business profile values exist for:
- shop name: `Kmo Rack Bar Custom`
- contact: `062-5893189`
- address: `ร้านKmo Rack Bar Custom 140 ซ. ร่มเกล้า 21` plus the existing Maps link

The dark-deploy tenant provisioning did not seed these profile fields. They belong to M4 real KMO booking setup and must not be guessed.

PromptPay remains intentionally unset.
## Still NOT VERIFIED
- Real Owner password login through the public Admin page.
- Authenticated dashboard rendering on the Owner's actual browser/device.
- Mobile usability for Owner operations.
- Shop Settings write, blocked by the generic PromptPay coupling above.

## Local proof environment note
The repository `.env.local` contains a valid KMO public anon key but its `SUPABASE_SERVICE_ROLE_KEY` value is a non-live placeholder. No live service-role value was printed, committed, or substituted into the repository. Linked database verification used the authenticated Supabase CLI Management API instead.

## Decision / next action
Do not close M3 yet.
Recommended next action is to remediate the generic Shop Settings/PromptPay coupling in canonical BK01 through the normal upstream process, then sync the verified committed upstream change into KMO. Separately, perform the one real Owner browser login/mobile smoke on the deployed Admin URL.

Until both are complete, M4/M5 must not be treated as authorized by an M3 PASS.
