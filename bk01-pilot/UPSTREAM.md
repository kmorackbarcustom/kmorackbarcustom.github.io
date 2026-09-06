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
