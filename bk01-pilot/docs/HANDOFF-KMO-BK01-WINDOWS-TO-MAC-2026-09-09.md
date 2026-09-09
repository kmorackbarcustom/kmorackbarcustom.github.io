# HANDOFF — KMO BK01 WINDOWS TO MAC

Date: 2026-09-09 (Asia/Bangkok)
Project: KMO RACKBARCUSTOM / BK01 independent pilot
Branch: `pilot/bk01-independent-deployment`
Source checkpoint commit: `20e5c0a763a8572c6591a6011494dc2e74f22a3c`

## Migration rule

Do **not** start from the GitHub remote as the source of truth for this move.
The local branch contains additional reviewed commits that have not been pushed.
Use the Windows checkpoint bundle prepared under:

`D:\AI-Workspace\transfers\KMO-BK01-WINDOWS-TO-MAC-2026-09-09\KMO-BK01-WINDOWS-CHECKPOINT.bundle`

No secrets are intentionally stored in the Git bundle.
Environment values must come from the authorized KMO secret source on Mac and must never be committed.

## Cloud resources remain the same

- Supabase project ref: `xfhpwxjywqgqefbncumm`
- Cloudflare account id: `c7d775fe2e3175ca58c0959867814998`
- Admin Worker: `kmo-booking-admin`
- Consumer Worker: `kmo-booking-consumer`
- Cloudflare profile must be `kmo`
- dark Consumer deployments must use `wrangler.dark.jsonc`

## State already applied to live KMO Supabase

Do not blindly re-run patches on Mac. Verify first.
The Windows checkpoint already applied:
- profile/PromptPay decoupling
- shop weekly schedule support
- KMO-first weekly fail-closed hardening
- service duration value/unit support

Expected public read state at handoff:
- services `2`
- staff `0`
- weekly schedule rows `7`
- service duration unit columns are readable by anon

Expected service data remains:
- `แคชบาร์`: `855 minute`
- `แร็คท้าย`: `900 minute`

These values are legacy data, not a final business decision.

## First Mac verification

Before modifying code or deploying:
1. restore/checkout the bundle branch and verify commit history
2. install dependencies from the locked repository state
3. restore KMO `.env.local` values from the authorized secret source
4. link Supabase CLI to `xfhpwxjywqgqefbncumm`
5. verify Cloudflare active profile is `kmo`
6. run `npm test`, `npm run lint`, and production build
7. repeat public anon probe for shop/services/staff/weekly schedule
8. confirm real secret scan remains zero before any Cloudflare deploy
9. confirm current remote Worker versions before replacing them

## Deployment guard

At handoff time there has been **no new deploy** from the Windows remediation checkpoint.
Cloudflare still routes:
- Admin `14da45d6-0efa-4d7b-bf7d-cb5d82b282e2`
- Consumer `fe6730cc-c26c-4e4f-91d9-f4751d4e374c`

The Consumer normal config contains a cron schedule; dark deployment must continue using `wrangler.dark.jsonc` so the pilot does not enable scheduled work accidentally.

## Remaining product gate

Do not send Owner into another full mobile retest immediately after migration.
First close:
- an actual active staff fixture/configuration for KMO
- customer E2E smoke after dark deploy
- intended duration value/unit for real KMO services
- day-span architecture before enabling `day` services online

Then perform the narrow Owner retest for time input, staff schedule behavior, profile save, numeric service fields, duration units, and customer page truthfulness.

Reference report:
`docs/REPORT-KMO-BK01-WINDOWS-CHECKPOINT-2026-09-09.md`
