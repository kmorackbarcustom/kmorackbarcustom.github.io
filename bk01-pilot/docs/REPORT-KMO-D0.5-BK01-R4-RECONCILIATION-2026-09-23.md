# REPORT — KMO D0.5 BK01 R4 UPSTREAM RECONCILIATION

Date: 2026-09-23 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
KMO branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
KMO reconciliation base: `213fa104f7398d14b77b42bede90d9ebb1fda7f1`

## Inputs

- KMO upstream packet: `REPORT-BK01-R4-UPSTREAM-FAST-FORWARD-2026-09-23.md`
- BK01 reviewed source: `3b3a3338de029a058aa5763c806be42f8a5205ca`
- BK01 R4 closure/evidence: `50555c14d1c578caabc421dbad995c8f2b80709e`
- BK01 final docs: `5aea75856dcaa05dd5e03dd3247c18e301736059`
- Current KMO source, migrations, tests, prior mobile review and locked Domain contracts at the KMO reconciliation base.

D0.5 is READ / COMPARE / CLASSIFY / PLAN only. No product source, migration, runtime, canonical BK01, Order, Claim or Control implementation was changed by this step.

## Result

**D0.5 = PASS / D1A WORKLIST REDUCED.**

BK01 R4 is not safe to blind-merge into KMO. Current KMO already carries several equivalent or stronger downstream changes, while other R4 fixes remain absent and should be selectively adapted. KMO-specific weekly scheduling, production-capacity, identity/bridge and infrastructure contracts remain authoritative downstream truth.

## Reconciliation matrix

| Area | Current KMO vs closed BK01 R4 | Classification | D1A disposition |
|---|---|---|---|
| Public Services/Staff query | KMO already selects public fields without browser `is_active` filter; equivalent generic defect is closed upstream. | `STALE_KMO_FINDING` | Regression verify only; do not redevelop. |
| Zero/error customer states | KMO separates `LOAD_ERROR` from not-found, but still lacks the full R4 `NO_SERVICES/NO_STAFF/NO_SCHEDULE/PAYMENT_NOT_CONFIGURED` state contract. | `SYNC_FROM_BK01` | Adapt R4 state resolver/screens to KMO data model. |
| Profile vs payment | KMO already has owner-scoped `update_shop_profile` separate from payment settings. This is stronger/more explicit than the R4 source contract. | `KMO_AHEAD_UPSTREAM_CANDIDATE` | Preserve KMO implementation; regression test only. |
| Fake PromptPay recipient | KMO already removed the historical hardcoded recipient fallback. | `STALE_KMO_FINDING` | Verify no regression; no rebuild. |
| Deposit amount truth | KMO still derives `selectedService.deposit_amount ?? shop.default_deposit_amount ?? 100`; BK01 R4 uses authoritative hold/payment instruction state. | `SYNC_FROM_BK01` | Remove invented 100/default display authority; adapt server-authoritative payment instruction. |
| Hold expiry | KMO still initializes/resets a client `900` second timer; BK01 R4 derives countdown from server `expires_at`. | `SYNC_FROM_BK01` | Adopt server-authoritative expiry calculation. |
| Numeric editing | KMO already stores service numeric edit values as strings and rejects invalid/empty save without forcing zero. | `STALE_KMO_FINDING` | Regression verify; optional helper/test reuse only. |
| Mobile HH:MM grammar | KMO parser rejects malformed grammar rather than stripping arbitrary characters; BK01 R4 parser is more permissive. | `KMO_AHEAD_UPSTREAM_CANDIDATE` | Preserve strict KMO grammar; use BK01 mobile UX evidence, not its parser verbatim. |

| Staff A/B unsaved preservation | KMO single-card save no longer reloads all schedules and therefore does not erase Staff B edits. | `STALE_KMO_FINDING` | Regression verify only. |
| Staff save failure semantics | KMO snapshots and rolls a failed staff card back; BK01 R4 primarily keeps dirty state and exposes save-all/dirty UX. | `KMO_AHEAD_UPSTREAM_CANDIDATE` | Preserve rollback semantics; selectively add dirty/status UX if compatible. |
| Dirty indicators / save-all | BK01 R4 has explicit dirty tracking, leave guard and save-all; KMO lacks equivalent UX. | `SYNC_FROM_BK01` | Adapt as bounded admin UX without removing KMO rollback. |
| Shop weekly schedule | KMO owns `shop_weekly_schedules`; current trigger returns `NEW` when the weekly row is missing. BK01 R4 does not close this KMO invariant. | `KMO_AHEAD_UPSTREAM_CANDIDATE` | Keep model; fix missing-row fail-open and prove create/reschedule fail-closed. |
| Staff hours vs shop hours | KMO UI validates staff hours inside shop hours, but DB RPC consistency remains an active downstream finding. | `KMO_AHEAD_UPSTREAM_CANDIDATE` | Add DB-backed invariant/test; do not rely on UI only. |
| Holiday precedence | KMO combines shop weekly, shop holiday and staff holiday reality beyond generic R4. | `KMO_ONLY` | Preserve and re-prove precedence/create/reschedule behavior. |
| Public schedule/holiday predicate grants | BK01 R4 closure repaired live KMO anon `SELECT(shop_id)` on `staff_schedules` and `shop_holidays`; current KMO baseline SQL still omits those predicate columns. | `SYNC_FROM_BK01` | Reconcile source-of-truth with the exact narrow proven grant; no broad SELECT. |
| Service duration: minute/hour/day | KMO exposes `duration_unit='day'`, while Booking slot/write semantics remain fundamentally same-day; BK01 R4 only proves flexible minute durations. | `CONTRACT_CONFLICT` | Preserve KMO data, but D1A must not claim true multi-day Booking safety. No blind upstream downgrade. |

| True multi-day/custom fabrication | KMO operations require multi-day/custom work and production load; neither current Booking engine fully models cross-date occupancy. | `BOTH_HAVE_GAP` | Keep outside a fake same-day patch; document limitation and separate future design boundary. |
| Production capacity | `public.production_allocations` and queue-density concepts are KMO operational authority. | `KMO_ONLY` | Do not replace or move into generic Booking during D1A. |
| Customer identity/bridge | KMO keeps `public.customers` and `local_service.customers` separate with `kmo_bridge.*` reconciliation. | `KMO_ONLY` | Preserve; D1A proves ambiguity fails closed/manual review. |
| Tenant / outsider denial | Generic R4 tenant behavior is useful evidence, but KMO has its own project, RLS and bridge boundary. | `KMO_ONLY` | Fresh KMO owner/admin allow + outsider/cross-tenant deny evidence still required. |
| Notification failure vs Booking truth | KMO notification/OA runtime is downstream operational integration; R4 positive E2E intentionally disabled external side effects. | `KMO_ONLY` | Re-prove retry/failure cannot corrupt Booking truth. |
| Order / Claim operational reality | Real KMO operations exist, but this D1 task does not authorize Order/Claim implementation. | `KMO_ONLY` | Preserve non-interference; keep `NOT_AUTHORIZED_YET`. |

## Sync now

Selective D1A adoption candidates are limited to:
1. full truthful customer-state separation from BK01 R4;
2. server-authoritative deposit/payment display semantics;
3. server-authoritative hold expiry;
4. BK01 dirty-state/save-all UX concepts, adapted around KMO rollback semantics;
5. exact narrow `shop_id` predicate-grant source reconciliation already proven against KMO runtime.

No whole-file copy or branch merge is authorized.

## KMO ahead / preserve

Keep without upstream overwrite:
- owner-scoped profile/payment decoupling;
- strict malformed-time grammar;
- failed staff-card rollback behavior;
- shop-weekly scheduling model and its real-shop closure semantics;
- KMO production-capacity authority;
- KMO identity/bridge boundary;
- KMO-owned GitHub/Supabase/Cloudflare/secrets/deployment identity.

These are candidates for upstream feedback only when generalized and proven. They are not reasons to mutate canonical BK01 from this task.

## Stale findings removed from D1A implementation

The following historical findings no longer justify new implementation work:
- public Services/Staff `is_active` browser filtering;
- hardcoded fake PromptPay recipient;
- numeric field forced-zero editing;
- Staff A save erasing Staff B unsaved edits.

They remain regression checks/evidence history, not implementation cards.

## Genuine remaining KMO defects / evidence gaps

- baseline SQL omits the two `shop_id` anon predicate grants that runtime now has;
- customer negative-state coverage is incomplete;
- deposit display still has invented/default client authority including `?? 100`;
- countdown still has independent `900` client authority;
- missing shop-weekly row fails open at booking write boundary;
- DB-level staff-hours vs shop-hours consistency remains incomplete;
- tenant/outsider, notification failure and bridge ambiguity need fresh D1 evidence.

## Contract conflicts / stop boundaries

1. KMO's `day` duration representation must not be interpreted as proof that Booking safely supports multi-day appointments. Do not delete KMO duration/production truth merely to match BK01.
2. Multi-day fabrication/workshop capacity is not solved by converting days to minutes inside the current same-day Booking engine.
3. KMO identity remains bridge-based; no universal customer primary key may be introduced for parity.
4. KMO static QR/payment extensions may remain, but any customer-facing amount/recipient must have explicit authoritative provenance and fail closed when unavailable.
5. Order and Claim remain outside D1 implementation despite their real operational existence.

## D0.5 promotion decision

D1A may resume only from the reduced brief:
`docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`.

A fresh Relay/Hermes task-specific preflight remains mandatory before dispatch because executor/runtime state may have changed. The reconciliation itself does not grant production mutation authority.

**Final D0.5 marker:** `D0.5_BK01_R4_UPSTREAM_RECONCILIATION = PASS`.
