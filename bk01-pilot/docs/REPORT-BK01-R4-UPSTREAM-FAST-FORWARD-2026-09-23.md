# REPORT â€” BK01 R4 Closure Upstream Fast-Forward for KMO

**Date:** 2026-09-23 (Asia/Bangkok)
**Direction:** WSTERA BK01 -> KMO RACKBARCUSTOM
**KMO task:** `KMO-DOMAIN-BOOKING-READINESS-001`
**KMO branch:** `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
**KMO checkpoint when this report was issued:** `81a6a410c58323ded4cd113ccd6d78d355e7ce74`

## Purpose

Fast-forward KMO Booking to the latest proven BK01 state before D1A implementation starts, without turning KMO into a mirror of canonical BK01 and without discarding KMO-specific operational truth.

This report is evidence and execution guidance. It does not authorize blind merge, canonical BK01 mutation, Order/Claim implementation, KMO Control implementation, production cutover, or secret/runtime sharing.

## Canonical BK01 status received from upstream

Canonical WSTERA BK01 completed and closed R4 Real-Shop Hardening.

Exact upstream references:

- Reviewed product source: `3b3a3338de029a058aa5763c806be42f8a5205ca`
- R4 closure/evidence commit: `50555c14d1c578caabc421dbad995c8f2b80709e`
- Final canonical documentation reconciliation: `5aea75856dcaa05dd5e03dd3247c18e301736059`

Upstream R4 disposition:

```text
IMPLEMENTATION CLOSED
ACCEPTANCE CLOSED
EVIDENCE CLOSED
GIT CLOSED
```

R4 closure was backed by browser/mobile/runtime evidence, not source review alone.

## KMO current position

KMO remains a controlled downstream deployment.

The current task branch is clean and at:

```text
81a6a410c58323ded4cd113ccd6d78d355e7ce74
```

The delta from accepted base `671d8f078c5dda3ba510c61bf721ac8ae13eb2f0` to `81a6a410...` is documentation/governance only. D1A Booking implementation has not started.

This makes the current checkpoint the correct place to reconcile upstream R4 before spending KMO engineering effort.

## Non-negotiable operating rule

Existing KMO bidirectional-learning rules remain authoritative:

```text
BK01 -> KMO
selectively sync/adapt proven generic improvements

KMO -> BK01
report proven generic defects, reusable improvements and product findings

BK01 owns upstream product disposition
KMO owns downstream operational truth
```

Do not blind merge. Do not create a silent permanent fork.

## Upstream R4 areas KMO should review before D1A

### Public Services / Staff read contract

BK01 removed browser dependence on private `is_active` filtering. Public clients read only customer-facing fields and RLS remains the active-row authority.

KMO independently reproduced the same 42501 class of problem.

**Disposition:** `SYNC_FROM_BK01 candidate`.

Do not widen public grants merely to restore browser-side `is_active` filtering.

### Truthful customer states

R4 proves distinct customer states including:

- `OK_STEPPER`
- `NO_STAFF`
- `SHOP_NOT_FOUND`
- `NO_SERVICES`
- `NO_SCHEDULE`
- `NO_SLOT_FOR_DATE`
- `PAYMENT_NOT_CONFIGURED`
- `BOOKING_DISABLED`
- `LOAD_ERROR`

Critical invariant:

```text
healthy zero rows / incomplete configuration
!=
runtime, permission or query failure
```

KMO previously found the same class of defect around zero staff and resource read failure.

**Disposition:** `SYNC_FROM_BK01 candidate`.

### Profile / payment separation

R4 proves that ordinary shop profile configuration must not require invented PromptPay information. Payment readiness is a separate capability and payment-required flows fail closed when verified payment authority is absent.

KMO independently implemented a downstream profile-decoupling mitigation.

**Disposition:** compare both implementations. Do not overwrite the KMO version if its contract is stronger.

### Numeric editing

R4 proves:

- empty string is allowed during editing;
- invalid value remains visibly invalid;
- invalid save performs no mutation;
- valid save persists.

KMO previously identified the same forced-zero defect.

**Disposition:** parity check / selective sync.

### Mobile HH:MM behavior

R4 proves keyboard-oriented HH:MM behavior and mobile usability expectations.

KMO already has its own `time-input.ts` and additional findings about malformed input grammar.

**Disposition:** bidirectional review. KMO may be ahead; do not replace its parser blindly.

### Multi-staff dirty-state behavior

R4 proves that saving Staff A does not destroy unsaved Staff B changes and that dirty state remains visible.

KMO additionally identified a downstream failure-path issue where optimistic local Staff A state may survive RPC failure.

**Disposition:** upstream fix plus KMO-specific extra finding. Preserve both until re-proven.

### Payment truth

R4 proves:

- no fake PromptPay recipient;
- no fabricated deposit amount;
- price edit does not silently overwrite the merchant's deposit decision;
- invalid payment setup must not expose authoritative-looking QR/copy/download/slip behavior;
- displayed recipient/amount must come from authoritative runtime state.

KMO already removed the historical fake PromptPay fallback.

**Disposition:** verify contract parity; do not regress KMO fail-closed behavior.

### Server-authoritative expiry

R4 countdown follows server `expires_at`, not an independently invented client timer.

**Disposition:** generic invariant; adopt where applicable.

## KMO areas that must NOT be overwritten by upstream parity

### KMO-owned infrastructure

Remain KMO-owned:

- GitHub
- Supabase
- Cloudflare
- secrets
- Worker names
- deployment/cutover lifecycle

No WSTERA runtime identity, production endpoint, shared-runtime assumption or secret may be imported for parity.

### KMO schema / identity boundaries

The D1 Master Brief remains authoritative:

```text
public.*
local_service.*
kmo_booking.*
kmo_bridge.*
```

`public.customers` and `local_service.customers` remain separate identities reconciled through the bridge. Do not introduce a universal customer PK merely to match upstream.

### KMO shop-weekly model

KMO has already experimented with `shop_weekly_schedules` and independently found a serious invariant gap:

```text
missing weekly row -> current downstream trigger may fail open
```

BK01 R4 closure does not automatically close this downstream invariant.

**Disposition:** `KMO_AHEAD_UPSTREAM_CANDIDATE`.

### Production capacity / custom-work reality

KMO real operations include:

- Booking
- Order
- Claim
- vehicle drop-off
- production workload
- pickup/install dates
- shipping
- case open/close dates

The KMO repository already contains operational production-capacity concepts such as `production_allocations` and `get_upcoming_queue_density`.

These must not be flattened merely to make KMO look like BK01.

KMO remains the proving ground for:

> How Booking, Order and Claim consume shared workshop capacity without overbooking production and without unnecessarily refusing revenue.

## Order / Claim boundary

The current D1 task correctly keeps:

```text
Order: NOT_AUTHORIZED_YET
Claim: NOT_AUTHORIZED_YET
```

This does not mean KMO has no real Order/Claim operations. It means D1 Booking readiness must not accidentally redesign or integrate those domains.

The copied BK01 Order V1 contract is reference/hypothesis, not KMO implementation authority.

KMO real operation may prove that the current single-target-day capacity model is insufficient for multi-day custom fabrication, parallel work, technician constraints, vehicle occupancy, install capacity or delivery/pickup timing.

## Required pre-D1A reconciliation

Insert an evidence step before substantive D1A implementation:

```text
D0
-> D0.5 BK01 R4 UPSTREAM RECONCILIATION
-> D1A AGY Booking Readiness
```

D0.5 is a READ / COMPARE / CLASSIFY / PLAN step.

Required inputs:

```text
KMO:
81a6a410c58323ded4cd113ccd6d78d355e7ce74

BK01 reviewed source:
3b3a3338de029a058aa5763c806be42f8a5205ca

BK01 R4 closure:
50555c14d1c578caabc421dbad995c8f2b80709e

BK01 current canonical docs:
5aea75856dcaa05dd5e03dd3247c18e301736059
```

Required output:

- exact KMO/BK01 reconciliation matrix;
- upstream sync candidates;
- KMO-ahead findings;
- stale KMO findings already closed upstream;
- genuine remaining D1 defects;
- contract conflicts;
- updated upstream feedback ledger;
- reduced, exact D1A implementation brief.

No product source change should be made merely to produce the reconciliation matrix.

## Required classification for each meaningful difference

Use exactly one primary classification:

- `SYNC_FROM_BK01` â€” verified generic upstream improvement compatible with KMO.
- `KMO_AHEAD_UPSTREAM_CANDIDATE` â€” KMO has a stronger/new finding that may improve BK01.
- `BOTH_HAVE_GAP` â€” neither side adequately models the real operational requirement.
- `KMO_ONLY` â€” shop-specific behavior that remains downstream.
- `STALE_KMO_FINDING` â€” already closed upstream; do not redevelop independently.
- `CONTRACT_CONFLICT` â€” assumptions intentionally conflict; preserve for explicit disposition.

## First comparison matrix

Prioritize:

1. public Services / Staff query contract;
2. zero-staff / zero-service / load-error behavior;
3. profile vs payment separation;
4. PromptPay/payment fail-closed behavior;
5. numeric editing;
6. mobile HH:MM behavior;
7. multi-staff dirty-state behavior;
8. shop weekly schedule / missing-row semantics;
9. holiday precedence;
10. create/reschedule enforcement;
11. duration / same-day vs multi-day behavior;
12. public exposure / RLS;
13. deposit hold lifecycle;
14. notification failure vs Booking truth;
15. tenant isolation / outsider denial.

## KMO findings that remain active until re-proven

Do not close these merely because BK01 R4 closed:

- missing shop-weekly row fail-open;
- staff-hours vs shop-hours database consistency;
- per-card save failure/rollback behavior;
- strict malformed-time grammar;
- true multi-day/custom-work scheduling;
- KMO shared production-capacity model;
- KMO identity/bridge ambiguity behavior;
- KMO-specific production constraints.

## Promotion rule

Never sync from an uncommitted BK01 working tree.

Required direction:

```text
committed BK01 source/evidence
-> inspect exact diff
-> classify
-> selectively adopt/adapt
-> KMO tests
-> independent QA
-> runtime proof where authorized
```

Never import WSTERA secrets, env files, runtime identity or production targets.

## Fast-forward success condition

The goal is not:

```text
KMO == BK01
```

The goal is:

```text
KMO uses proven generic BK01 improvements
while preserving KMO-specific operational truth
and continues discovering what canonical BK01 does not yet understand.
```

After D0.5, resume the existing Domain D1 long-run from the reduced evidence-backed worklist.

KMO should not wait for every future BK01 commit. Reconcile at meaningful stage boundaries, then continue independently.

## Owner direction

Owner direction on 2026-09-23: fast-forward KMO to the proven BK01 R4 state as quickly as safely possible, but do not force KMO to copy upstream behavior where KMO has distinct real-shop requirements, stronger downstream behavior, or unresolved real-world findings.

KMO remains a real-shop proving ground, not a mirror deployment.
