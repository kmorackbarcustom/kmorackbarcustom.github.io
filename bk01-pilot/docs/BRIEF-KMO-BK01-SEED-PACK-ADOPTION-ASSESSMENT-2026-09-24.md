# BRIEF — KMO BK01 SEED PACK ADOPTION ASSESSMENT

Date: 2026-09-24 (Asia/Bangkok)
Program: KMO RACKBARCUSTOM
Work type: `READ / CLASSIFY / ADOPTION PLAN`
Execution mode: read-only against active KMO source; docs/planning output only
Source branch: `prep/kmo-bk01-upstream-seed-20260924`
Source checkpoint: `a54bab16a141adf2ec065d0d7aab823831d455e3`
Seed Pack source target: `73d7651ab302f84d80859d743768b3f13efbf608`
Seed Pack status: `KMO_BK01_UPSTREAM_SEED_PACK = READY`
Codex verdict: `SEED_PACK_PASS`

## 1. Objective

Review the complete KMO BK01 upstream seed pack and decide, item by item, what KMO should:

- use as-is;
- adapt before use;
- keep only as reference;
- reject;
- treat as already present/duplicate;
- preserve KMO truth over upstream;
- defer until a future authorization gate.

The goal is not merely to make a list.

The goal is to produce a **single adoption decision set** and, if the reviewed material is usable as a coherent whole, produce a **one-shot KMO integration plan** that can later be executed as one coordinated long-run work package instead of many disconnected micro-tasks.

This task is planning/reconciliation only. Do not modify active KMO implementation in this round.

## 2. Mandatory source set

Read before making any decision:

1. `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/README.md`
2. `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/MANIFEST.md`
3. `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/IMPORT_MAP.md`
4. `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/ALREADY_PRESENT.md`
5. `bk01-pilot/docs/REPORT-CODEX-KMO-BK01-UPSTREAM-SEED-PACK-REVIEW-2026-09-24.md`
6. `bk01-pilot/docs/REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`
7. `bk01-pilot/docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`
8. `bk01-pilot/docs/KMO_SCHEMA_CONTRACT.md`
9. `bk01-pilot/docs/KMO_EXTENSION_DESIGN.md`
10. current active Booking/Admin/Consumer source, current KMO migrations, tests, and operational contracts at the exact reviewed revision.

Use the copied reference files as evidence. Do not infer implementation state merely because a file exists in the Seed Pack.

## 3. KMO truth that upstream may not overwrite

Treat these as protected KMO authority unless evidence proves an explicit later Owner decision supersedes them:

- shop weekly schedule;
- special shop holidays and staff holidays;
- production capacity and `public.production_allocations`;
- custom fabrication reality;
- multi-day operational work;
- actual ready-date/workshop load;
- KMO identity/bridge boundaries;
- separation of `public.customers` and `local_service.customers`;
- KMO-owned GitHub/Supabase/Cloudflare/runtime identity;
- existing KMO LINE/notification operational reality;
- Booking / Order / Claim as separate domain authorities behind one customer entry surface.

Never force KMO to mirror generic BK01 where KMO has stronger real-shop truth.

## 4. Classification vocabulary

Every meaningful Seed Pack item/concept must receive exactly one primary disposition:

- `USE_AS_IS` — safe to adopt without semantic change;
- `ADAPT_FOR_KMO` — useful, but must be changed for KMO contracts/runtime;
- `ALREADY_PRESENT` — active KMO already has equivalent or identical behavior;
- `REFERENCE_ONLY` — useful evidence/design, not intended for runtime adoption;
- `PRESERVE_KMO_OVER_UPSTREAM` — upstream pattern conflicts with stronger KMO truth;
- `REJECT_FOR_KMO` — not useful or inappropriate for KMO;
- `FUTURE_AUTHORIZATION_REQUIRED` — technically useful but outside current implementation authority;
- `CONTRACT_CONFLICT` — cannot be adopted until a business/data/security contract is resolved.

Add a secondary risk tag where relevant:

- `LOW`
- `MEDIUM`
- `HIGH`
- `OWNER_DECISION`

## 5. Mandatory assessment areas

### A. Booking R4 helpers

Assess at minimum:

- `booking-state.ts`
- `load-result.ts`
- `payment-instruction.ts`
- `readiness.ts`
- `schedule-merge.ts`
- related tests/evidence

For each, compare against current active KMO source rather than assuming absence or inferiority.

### B. Public Portal

Assess:

- one customer link / `/shop/[slug]`;
- capability resolver;
- `bookingEnabled / orderEnabled / claimEnabled`;
- disabled-capability behavior;
- customer-facing routing;
- fail-closed semantics;
- i18n material.

Decide whether this should become the canonical KMO customer entry.

If yes, state exactly which current KMO customer routes remain, redirect, coexist, or become internal destinations.

### C. Claim

Assess:

- public Claim intake;
- Booking → Claim;
- Order → Claim;
- standalone Claim;
- opaque tracking token;
- public status projection;
- forbidden internal-field stripping;
- idempotency;
- Ticket/Case adapter boundary;
- Claim tracking UI;
- fail-closed runtime behavior.

Do not create a second Claim lifecycle engine.

Current implementation authority must still be respected. If useful but not currently authorized, classify `FUTURE_AUTHORIZATION_REQUIRED`.

### D. Order safe scaffold

Assess:

- Order lifecycle;
- payment state;
- deposit state;
- immutable line snapshots;
- integer money;
- lead time;
- requested date;
- reservation release;
- capacity model;
- Order → Booking delegation;
- opaque tracking;
- idempotency;
- shop-scoped ports;
- public projection.

For capacity specifically, compare upstream assumptions against KMO `public.production_allocations` and real multi-day/custom production.

Do not replace KMO production truth with the generic BK01 capacity calendar.

### E. Already-present capabilities

Verify whether these still remain equivalent in active KMO:

- customer cancel/reschedule;
- recovery-token booking management;
- private deposit-slip upload;
- notification retry/backoff;
- reminder cancellation;
- notification failure separated from Booking truth.

If unchanged, classify `ALREADY_PRESENT` and do not schedule implementation work.

### F. Proof/evidence harness

Assess which R4 proof patterns should become KMO standard verification:

- truthful-state matrix;
- Admin acceptance matrix;
- desktop/mobile proof;
- positive Booking E2E;
- cross-tenant isolation;
- rapid tenant navigation;
- temporary isolated fixtures;
- residue-zero cleanup;
- before/after KMO business-data fingerprint;
- suppression of external side effects during test.

Separate reusable verification methodology from product implementation.

## 6. Required adoption matrix

Produce one complete table with at least:

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|

No meaningful Seed Pack concept may be omitted merely because it appears inconvenient or already familiar.

## 7. Required summary outputs

Produce explicit sections:

### USE NOW
Items that can safely enter the next KMO implementation package.

### ADAPT
Items worth using but requiring KMO-specific modification.

### ALREADY PRESENT
Items that must not generate duplicate work.

### PRESERVE KMO
Areas where KMO must remain authoritative over upstream.

### REJECT
Material that should not be incorporated into KMO.

### FUTURE GATED
Useful items blocked only by current Order/Claim/other authorization.

### CONTRACT CONFLICTS
Any issue requiring an explicit Owner/data/security/business decision.

## 8. One-shot integration decision

After the full assessment, determine whether a coordinated one-shot integration is feasible.

Use one of:

- `ONE_SHOT_INTEGRATION_FEASIBLE`
- `ONE_SHOT_INTEGRATION_FEASIBLE_WITH_GATES`
- `SPLIT_INTEGRATION_REQUIRED`
- `OWNER_DECISION_REQUIRED`

Do not rate or score alternatives. Explain the concrete technical reason for the disposition.

### If all or nearly all useful material is compatible

Produce a **single KMO integration master plan** that minimizes repeated work.

The plan must:

1. preserve the current active Booking branch/worktree truth;
2. avoid blind merge/cherry-pick;
3. implement by KMO-owned semantic slices rather than upstream commit boundaries;
4. identify exact active KMO files expected to change;
5. identify migrations/RPC/RLS changes separately from UI/helper changes;
6. separate current-authorized work from future-gated Order/Claim activation;
7. define deterministic test/build/browser/runtime gates;
8. define Codex independent checkpoints;
9. define simple vs hard remediation routing;
10. define rollback boundaries;
11. define commit sequence;
12. define final integration/merge strategy;
13. define what remains parked after the one-shot package.

The desired shape is approximately:

```text
Preflight / source freeze
        ↓
Generic Booking helpers
        ↓
KMO Booking truth integration
        ↓
Public Portal shell
        ↓
Admin readiness / schedule UX
        ↓
Payment/hold authority
        ↓
Security/RLS/runtime reconciliation
        ↓
Tests + browser/mobile + runtime proof
        ↓
Codex independent QA
        ↓
bounded remediation
        ↓
final KMO integration candidate
```

Order/Claim source may be staged/adapted in the plan only within authorization boundaries. Do not silently activate them.

## 9. Current D1A relationship

Reconcile this assessment against the current reduced D1A worklist.

Explicitly state:

- which D1A items are replaced by Seed Pack adoption;
- which D1A items remain independently required;
- which Seed Pack items add useful work not already in D1A;
- which historical D1A items should be deleted as duplicate/stale;
- whether the final one-shot plan should supersede the current D1A brief or sit above it as a new master plan.

Do not let two overlapping worklists survive without a documented precedence rule.

## 10. Hard prohibitions

This assessment task must not:

- modify active `bk01-pilot/apps/**`;
- modify active `bk01-pilot/supabase/**`;
- modify active `bk01-pilot/order/**`;
- modify active `bk01-pilot/tests/**`;
- apply migrations;
- mutate runtime/database;
- deploy;
- activate Public Portal;
- activate Order;
- activate Claim;
- modify canonical BK01;
- merge the Seed Pack branch;
- invent new Owner decisions;
- erase KMO production/weekly/identity truth;
- resume D1A implementation automatically.

Docs/planning artifacts only.

## 11. Required artifacts

Create:

1. `bk01-pilot/docs/REPORT-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md`
2. If one-shot integration is feasible:
   `bk01-pilot/docs/PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md`

Optionally update `DOCUMENTATION_INDEX.md` with pointers only after the reports are complete.

## 12. Review requirement

Before declaring the adoption assessment final, run a read-only Codex review against the exact assessment revision.

Codex verifies:

- Seed Pack coverage is complete;
- classifications match current KMO source;
- no protected KMO truth was overwritten by planning assumptions;
- no duplicate D1A work survives;
- Order/Claim authorization boundaries are preserved;
- the proposed one-shot plan is internally coherent and executable;
- planned test/security/runtime gates cover the changed authority surfaces.

Allowed review verdicts:

- `ADOPTION_PLAN_PASS`
- `ADOPTION_PLAN_REMEDIATE`

Codex does not implement fixes.

## 13. Completion marker

If assessment is accepted:

`KMO_BK01_SEED_PACK_ADOPTION_DECISION = LOCKED`

If one-shot plan is also accepted:

`KMO_BK01_ONE_SHOT_INTEGRATION_PLAN = READY`

These markers authorize planning state only.

They do not authorize production mutation, merge, deploy, Order activation, or Claim activation.

Stop after plan + independent review.

Do not execute the integration until a subsequent explicit implementation dispatch.
