# KMO BK01 Pilot — Upstream Boundary

Canonical product: WSTERA BK01 / `Gutumrod/booking`
Canonical branch at copy: `feature/bk-a-v1-contract-remediation`
Canonical commit: `82b297df2d42156e750794ac4135852450570264`
Copy date: 2026-09-06 (Asia/Bangkok)

## Copy mechanism
The pilot was created from `git archive HEAD`, not from the canonical working tree.
At copy time canonical had two uncommitted DB files; both were intentionally excluded from the KMO snapshot.

## Included
- booking consumer
- booking admin core
- required shared booking code
- committed Supabase migration history
- root contract tests
- required architecture/security/release docs

## KMO runtime exclusions
- platform-admin route
- ticket UI/runtime
- Stripe checkout/portal/webhook runtime
- WSTERA worker names and WSTERA production URL fallback

## Sync rule
Generic defect: fix and verify in canonical BK01 first, release a committed upstream ref, then re-sync KMO.
KMO-only requirement: keep as KMO config/theme/deployment delta.
Never silently patch a generic BK01 defect only in this directory.

## Database compatibility note
The committed migration history is preserved as source evidence because later BK-A migrations reference subscription, ticket and platform-admin-era database objects.
Those compatibility migrations are **not approved for KMO production apply yet**. Remote KMO schema/RLS inspection must determine the safe migration/baseline boundary first.
No platform-admin application route or service is shipped in the KMO runtime.

## Verified generic patch sync — 2026-09-06
After the initial controlled copy, Gate 4 runtime inspection found a generic Supabase defect in the copied BK-A remediation:
`generate_link_token()` pinned `search_path = pg_catalog` but called unqualified `gen_random_bytes()`, while KMO Supabase exposes it in `extensions`.

Canonical BK01 had already fixed this in committed upstream `6e1c0c6ae2b6cdcc9074d503bc923255e4f91bef` (`fix(booking): close CONT-04 runtime defects`).
That commit also fixes the customer cancel/reschedule row-assignment defects used by the KMO consumer.

Synced exact upstream blobs from `6e1c0c6` into the KMO controlled copy:
- `supabase/migrations/20260829105155_bk_a_v1_contract_remediation.sql`
- `supabase/tests/bk_a_contract.sql`

Both KMO file blob hashes were verified byte-for-byte against upstream commit `6e1c0c6` before acceptance.
The unrelated ticket migration change from that commit was intentionally not synced because ticket runtime is excluded from the KMO pilot.