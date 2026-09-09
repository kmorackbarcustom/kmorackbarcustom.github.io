# REPORT — KMO BK01 WINDOWS CHECKPOINT

Date: 2026-09-09 (Asia/Bangkok)
Branch: `pilot/bk01-independent-deployment`
Source remediation commit: `20e5c0a763a8572c6591a6011494dc2e74f22a3c`
Verdict: **WINDOWS CHECKPOINT PASS — SAFE TO PACKAGE FOR MAC**

## Scope

Close the Windows-side KMO BK01 work into a reproducible checkpoint before continuing on Mac.
No canonical BK01 files were modified. No Git push and no Cloudflare deploy were performed.

## KMO live database state

Applied to KMO Supabase project `xfhpwxjywqgqefbncumm`:
- shop profile save decoupled from PromptPay
- generic seven-day shop weekly schedule
- KMO-first weekly fail-closed hardening
- service duration `value + unit` model

Current public contract proof:
- active/public services: `2`
- active/public staff: `0`
- shop weekly rows: `7`
- current existing service duration semantics remain `855 minute` and `900 minute`; no business meaning was guessed or rewritten

## Database behavior proof

Transactional fixture proof returned:
- `hour_normalization = true`
- `legacy_update_compatible = true`
- `fractional_minute_denied = true`
- `day_persistence = true`
- `day_booking_fail_closed = true`

Fixtures rolled back and no proof rows remain.
`day` duration is stored truthfully, but online day-span booking remains disabled until a real multi-day engine exists.

## Source/runtime fixes in checkpoint

- public consumer no longer queries private `is_active` columns
- explicit customer states for read failure, shop missing, zero services, zero staff, and zero slots
- shop profile save no longer depends on PromptPay
- mobile-friendly strict time parser; malformed values are rejected rather than guessed
- per-staff schedule save no longer reloads the full dashboard; failed save rolls back only that staff card
- staff schedule cannot exceed shop opening hours at UI and DB layers
- recurring weekly schedule is generic and missing configuration fails closed
- service numeric fields can be cleared/retyped and no longer auto-force a 30% deposit
- service duration supports `minute`, `hour`, and `day` as business data
- mojibake/BOM regression removed and guarded by test

## Verification gates

- `npm test`: **30/30 PASS**
- lint: **0 errors**; existing warnings only
- Next production build: Admin PASS / Consumer PASS
- OpenNext public-only build: Admin PASS / Consumer PASS
- real server-secret hits in OpenNext bundles: **0 / 0**
- placeholder fingerprints only: Admin `8`, Consumer `16`
- staged source secret scan: **0 real hits**
- `git diff --check`: PASS
- runtime weekday hardcode scan: no Monday/Tuesday hardcode found
- canonical/upstream touch scan: `0`
- `.env.local` restored: each app `14` keys = `9` public + `5` private

Cloudflare remote remains unchanged:
- Admin: `14da45d6-0efa-4d7b-bf7d-cb5d82b282e2`
- Consumer: `fe6730cc-c26c-4e4f-91d9-f4751d4e374c`

## Known remaining work after migration

- KMO currently has zero active staff, so customer E2E booking cannot complete yet.
- Existing services still carry their previous minute values; Owner must choose their intended value/unit instead of the system guessing.
- Day-based service booking needs a real day-span booking engine before it can be enabled online.
- Owner mobile retest remains gated until the next dark deploy and smoke test.

Three pre-checkpoint untracked docs were intentionally excluded from the source commit, archived outside the repo, and preserved in Git stash rather than mixed into this checkpoint.
