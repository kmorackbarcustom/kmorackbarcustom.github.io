# PLAN — KMO BK01 D1A LONG-RUN EXECUTION

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Status: `READY_FOR_OWNER_DISPATCH / IMPLEMENTATION_NOT_STARTED`
Execution target: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`

## 0. Authority and precedence

This plan is the corrected execution plan produced after independent verification of the Seed Pack adoption assessment.

Execution precedence after Owner dispatch:
1. current persisted Owner decisions and locked KMO contracts;
2. this plan + its locked Run Manifest;
3. `BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md` for D1A A-G semantics and regression scenarios;
4. `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`;
5. prior one-shot plan as historical planning evidence only.

The prior `PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md` must not be dispatched separately.

## 1. Execution base

Verified source/evidence anchor: `30c7e44ad86bc462683b97dab417cb22388bb908`.
Verified Domain tip at planning time: `058fe5211c9eb39d7dda3087ec40b1e896227113`.
`058fe52` is an ancestor of `30c7e44`; active implementation is byte-identical across those revisions.

Prepared package ref: `refs/tags/kmo-bk01-d1a-longrun-prepared-20260924`.
Hermes must resolve that tag to the exact package SHA during LR-00 and verify: (a) it descends from `30c7e44`; (b) the delta after `30c7e44` is documentation-only; (c) worktree is clean.

Create the fresh implementation branch/worktree from the resolved tag target, not from an unpinned moving branch.
Target branch name: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`.
Merge target after final approval: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`.

If the Domain branch advances before branch creation, HOLD and reconcile first. Do not build on a silently stale base.

## 2. Workflow selection

New execution pin:
- Workflow: `WF-DEV-01 v1.4.0`
- Execution Mode: `LONG_RUN`
- Hermes composition: `WF-RELAY-01 v1.3.0`
- Relay runtime: `kanban-external-agent-dispatch v2.5.3`
- Workflow authority revision inspected: `Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a`

Reason: implementation spans UI, database/RLS/concurrency, proof, independent QA, remediation, runtime evidence and D1 contract closure. LONG_RUN removes unnecessary Owner round-trips while preserving exact-revision gates.

Role contract:
- Hermes = orchestrator/state holder only.
- OpenCode = ordinary implementation worker.
- AGY = UI/UX specialist only.
- Qwen = command-heavy tests/SQL qualification/bounded remediation support.
- Codex = principal independent reviewer; canonical model pin `gpt-5.6-luna`.
- Claude = senior difficult remediation only, or reviewer fallback only when Codex is demonstrably unavailable and independence remains valid.

Before substantive work Hermes must persist the workflow re-pin into the Task checkpoint and pass a fresh task-specific runtime/executor preflight.

## 3. Scope lock

IN:
- D1A A-G;
- Seed Booking helpers/proof patterns;
- F-1 and F-2;
- KMO appointment-date intake capacity;
- KMO Booking operational work state;
- admin readiness/work visibility;
- tests/security/non-production evidence;
- Control-facing Booking contract closure.

PARKED / OUT:
- Public Portal and root-route change;
- all Order runtime/source/routes/tables/RPCs;
- all Claim runtime/source/routes/tables/RPCs;
- KMO Control implementation;
- canonical BK01 mutation;
- generic cross-domain production-capacity engine;
- production apply/deploy without an explicit Owner stage authorization.

## 4. Locked data placement

KMO-specific intake data must remain outside generic BK01 core.

Create under `kmo_booking`:

1. `intake_settings`
   - `shop_id` PK/FK to `local_service.shops`;
   - `daily_capacity_units integer >= 0`;
   - `default_booking_units integer >= 1`;
   - audit timestamps/actor as appropriate.
   - Missing row = public hold/reschedule capacity path fails closed.

2. `service_intake_policy`
   - one optional row per `local_service.services.id`;
   - `shop_id` + `service_id`;
   - `intake_units integer >= 1`.
   - New hold uses service override, otherwise the explicitly configured shop default.

3. `booking_intake`
   - one immutable capacity snapshot per `local_service.bookings.id`;
   - `booking_id`, `shop_id`, `intake_units`, source/policy metadata, timestamps.
   - New holds snapshot units server-side; browser cannot submit arbitrary units.
   - Reschedule reuses the stored snapshot; it does not recalculate from current service configuration.
   - Existing pre-feature BK01 bookings may be source-migrated to 1U as backward-compatible historical behavior, but live backfill occurs only in an authorized release stage.

No KMO-only intake column may be added to `local_service.shops/services/bookings` merely for convenience.
No direct anon/authenticated table write to these `kmo_booking` tables; use narrow authorized RPC paths.

## 5. Booking work-state boundary

Create `kmo_booking.booking_work_state`, one row per applicable confirmed Booking:
- states: `WAITING_TO_START`, `IN_PROGRESS`, `COMPLETED`;
- current actor/timestamps including started/completed timestamps;
- transitions only through owner/admin-authorized RPC;
- accepted transitions write an audit event; failed transitions are atomic/no-op.

This state is **Booking operational progression only** so due/overdue custom work stays visible after appointment day.

It is NOT KMO Order/job authority and NOT production scheduling truth.
This task must not create, update, replace, mirror or dual-write `public.orders` or `public.production_allocations`.
Future synchronization with Order/production requires a separate authorized contract/task.

## 6. Capacity/write invariants

- Capacity is consumed on `booking_date` / appointment date only.
- `pickup_date`, estimated work duration and unfinished work never block future public intake dates.
- Count only capacity-holding Booking states: non-expired `hold`, `pending_review`, `confirmed`.
- `cancelled`, `expired`, `no_show` release capacity.
- Create hold and reschedule enforce capacity atomically in the database.
- Cross-date reschedule locks old/new `(shop_id,date)` keys in deterministic order, releases old and consumes new in one transaction.
- Same-date reschedule never double counts.
- Concurrent hold + reschedule and concurrent reschedules cannot exceed units.
- Missing weekly schedule/configuration fails closed on both create and reschedule.
- DB enforces staff working hours inside authoritative shop hours.
- Public/UI availability remains advisory; write boundary is authoritative.

## 7. Long-run stage sequence

### LR-00 — Preflight / source freeze
Verify workflow/runtime provenance, exact source/branch/base, clean worktree, executor readiness, current Domain tip and baseline test/lint/build commands. No product edits.

### LR-01 — Pure Booking helpers
Adapt Booking state, payment instruction, readiness, schedule merge and focused unit tests. Preserve KMO schedule/payment/static-QR truth.

### LR-02 — Consumer truth/payment
Fix truthful page states, F-2, client amount authority and server expiry countdown. AUTO_GATE then Review Batch B1.

### LR-03 — DB contract and authority
Add KMO-owned intake/work-state schema, rollbacks, weekly/staff invariants, narrow grants and DB-backed tests. No runtime apply. Critical boundary forces independent Codex review B2/G-DB.

### LR-04 — Atomic create/reschedule + lifecycle RPC
Wire server-side intake snapshot/capacity and work-state transitions; prove authorization, rollback and public authority non-interference. Re-review B2 if LR-03 evidence is invalidated.

### LR-05 — Admin UI
Fix F-1 dirty-state preservation, readiness, capacity configuration, save-all/leave guard and due/overdue/work-state UI. AGY may own bounded UI/UX Work Units only; non-UI service/data work remains OpenCode.

### LR-06 — KMO proof harness
Run adapted D1A/R4 proof on an isolated non-production fixture: eight D1A intake/work scenarios, payment/expiry truth, reschedule concurrency, lifecycle authority, tenant isolation, notification failure, bridge ambiguity, data fingerprint and residue-zero cleanup. Capture mobile/desktop evidence where required.

### LR-07 — Independent batch QA + bounded remediation
Codex reviews exact candidate revisions, real diffs and raw evidence. Worker fixes stay bounded; hard DB/security/concurrency defects follow the approved escalation route. No reviewer shopping or self-review.

### LR-08 — Runtime/release evidence boundary
Read-only runtime verification may continue. Non-production apply may occur only if already authorized by the Run Manifest and environment is explicitly non-production. Any production schema apply/deploy/cutover stops at `OWNER_PRODUCTION_ACTION_REQUIRED`.

### LR-09 — Control-facing Booking contract
Document stable read contract, allowed privileged actions, Booking state/payment semantics, identity/bridge behavior, unsupported actions, limitations and exact revision. Do not implement Control.

### LR-10 — Final D1 audit / closure
Fresh Codex final audit, Hermes deterministic closure and final handoff. Terminal candidate marker only when evidence supports it:
`BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`.

## 8. Mandatory deterministic gates

From `bk01-pilot`:
- `npm test`
- `npm run lint`
- `npm run build`
- DB-backed SQL tests for changed authority paths
- `git diff --check`
- allowed-path audit
- exact-value generated-artifact secret scan
- clean or explicitly explained worktree
- evidence bound to exact SHA

Build invokes the repository's existing `sync-env`; any generated change must remain non-secret and be either ignored by design or explicitly accounted for before a PASS claim.

## 9. Review/repair policy

Critical boundary review is mandatory for database schema/RLS/grants, money/payment authority, capacity/concurrency and work-state authorization.

Default budgets:
- local fix attempts: 2 per issue cycle;
- reviewer-directed worker fixes: 2 per finding cycle;
- senior escalation: 1 when explicitly authorized by route.

A scope/contract/authority boundary is not a repair attempt: stop and route it.

## 10. Owner checkpoints

Routine technical failures do not return to Owner.

Owner is required only for:
- genuine product/business/architecture/security contract change;
- need to touch Order, Claim, KMO Control, `public.orders` or `public.production_allocations`;
- production DB apply/deploy/cutover;
- irreversible/destructive action;
- reviewer independence unavailable;
- unresolved hard defect after the authorized bounded escalation.

Portal is not an Owner checkpoint in this run because it is parked.

Claim OD-2 remains parked.
Order authority is not OD-3: `public.orders` remains authoritative under the current locked contract.

## 11. Final acceptance

The run may close only when:
- D1A A-G and required regression scenarios are evidenced on exact revision;
- F-1/F-2 are closed;
- intake capacity and reschedule concurrency are proven server-authoritative;
- Booking work state is authorized/audited and does not mutate Order/production truth;
- RLS/tenant/bridge/payment/notification failure cases are proven;
- customer/admin changed surfaces have required browser/mobile evidence;
- Control-facing Booking contract is stable;
- Order/Claim/Control remain untouched;
- final independent review and deterministic closure pass.

Production readiness/live status is a separate state and must not be inferred from `BOOKING_READY_FOR_CONTROL_CANDIDATE`.
