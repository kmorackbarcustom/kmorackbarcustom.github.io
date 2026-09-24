# RUN MANIFEST — KMO-DOMAIN-BOOKING-READINESS-001

Manifest Status: DRAFT — READY FOR OWNER DISPATCH
Task ID: `KMO-DOMAIN-BOOKING-READINESS-001`
Workflow: `WF-DEV-01 v1.4.0`
Execution Mode: `LONG_RUN`
Workflow Registry: `1.6.0`
Owner Approval: NO — forwarding the paired execution brief is the approval event
Repository: `kmorackbarcustom/kmorackbarcustom.github.io`
Implementation Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`
Prepared Base Ref: `refs/tags/kmo-bk01-d1a-longrun-prepared-20260924`
Verified Evidence Anchor SHA: `30c7e44ad86bc462683b97dab417cb22388bb908`
Resolved Base SHA: `TO_BE_RECORDED_AT_LR-00_ACTIVATION`
Merge Target: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
Runtime Procedure: `WF-RELAY-01 v1.3.0 / kanban-external-agent-dispatch v2.5.3`
Workflow Authority: `Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a`

## Activation contract

Before any product edit, Hermes must:
1. verify the exact base and Domain tip;
2. create the implementation branch/worktree from the exact base;
3. persist the Task workflow re-pin and current checkpoint;
4. bind this manifest to the activation commit, change status to `LOCKED`, and record Owner Approval = YES;
5. pass fresh Relay + named-executor preflight.

If the Owner has not forwarded the paired execution brief, this manifest does not authorize execution.

## Source of Truth

1. `PLAN-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md`
2. `REPORT-SOL-KMO-BK01-SEED-ADOPTION-INDEPENDENT-VERIFICATION-2026-09-24.md`
3. `docs/tasks/TASK-KMO-DOMAIN-BOOKING-READINESS-001.md` plus activation re-pin
4. `BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`
5. `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`
6. `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`
7. `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, `docs/DOCUMENTATION_INDEX.md`
8. exact source/tests/SQL/reference pack at the active execution revision.

## Run objective

Produce one evidence-backed KMO Booking candidate that closes D1A A-G, F-1/F-2, KMO appointment-date intake capacity and Booking operational work-state while preserving Order/production/identity boundaries, then reach `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` or an exact declared stop.

## Global allowed paths

- `bk01-pilot/apps/booking-consumer/**`
- `bk01-pilot/apps/booking-admin/**`
- `bk01-pilot/tests/**`
- `bk01-pilot/supabase/kmo-baseline/**`
- bounded KMO Booking docs/evidence under `bk01-pilot/docs/**`
- reference pack READ ONLY.

## Global prohibited paths/actions

- no active Portal/Order/Claim route or runtime implementation;
- no KMO Control implementation;
- no canonical BK01 mutation;
- no writes to `public.orders` or `public.production_allocations`;
- no KMO-only fields added to generic `local_service.*` without a separately approved contract change;
- no global model/runtime/config edits;
- no production schema apply/deploy/cutover without Owner stage authorization;
- no merge to the Domain target until final workflow approval.

## Canonical budgets and reviewer policy

```yaml
local_fix_attempts_per_issue_cycle: 2
reviewer_remediation_attempts_per_finding_cycle: 2
senior_escalations_per_authorized_decision: 1
max_stages_per_batch: 3
max_changed_files_per_batch: 15
critical_boundary_forces_review: true
primary_reviewer: Codex
codex_model_pin: gpt-5.6-luna
fallback_reviewer: Claude
fallback_only_when_primary_unavailable: true
no_self_review: true
no_reviewer_shopping: true
```

Codex effective model/provenance must be proven at preflight. This Task must not repair global Codex configuration. A stale/unsupported default is an executor-readiness issue, not product scope.

## Stage graph

| Stage | Objective | Review Batch | Owner checkpoint |
|---|---|---|---|
| LR-00 | preflight/source freeze/manifest activation | none | only if source/workflow authority conflicts |
| LR-01 | pure helpers + focused tests | B1 | none |
| LR-02 | consumer truth/payment/expiry + F-2 | B1 | none |
| LR-03 | KMO intake/work schema + security contracts | B2 critical | none before runtime apply |
| LR-04 | atomic create/reschedule + work-state RPC | B2 critical | none before runtime apply |
| LR-05 | admin schedule/readiness/capacity/work UI + F-1 | B3 | none |
| LR-06 | isolated proof harness + browser/mobile evidence | B3 | manual real-shop acceptance only if required |
| LR-08 | runtime/release evidence boundary | B4 | production action if required |
| LR-09 | Control-facing Booking contract | B4 | none |
| LR-10 | final independent audit + closure | FINAL | unresolved authority/hard blocker only |

## LR-00 — Preflight / source freeze

State: `PENDING`
Worker: Hermes orchestration only; no product patch.
Acceptance:
- prepared tag resolves to an exact base SHA that descends from `30c7e44`, with documentation-only delta after that evidence anchor, and clean worktree;
- current Domain target still `058fe52` or reconciliation performed before build;
- registry/spec/runtime provenance verified;
- OpenCode/Qwen/AGY/Codex readiness checked for only the roles needed;
- Task/manifest activation commit persisted;
- baseline commands and allowed paths recorded.
AUTO_GATE: git identity/status, workflow/runtime hashes/version, executor preflight, Source of Truth readability.
Stop: any drift/authority conflict => `BLOCKED`.

## LR-01 — Pure helper adaptation

State: `PENDING` · Review Batch: B1
Worker: OpenCode.
Allowed: consumer/admin `src/lib/**`, focused tests, message keys only when required.
Objective: adapt truthful state/load-result/payment/readiness/schedule helpers without wiring routes.
Acceptance: unit tests for KMO semantics; no active route behavior change yet.
AUTO_GATE: focused tests + full `npm test` + allowed-path diff.
Timeout decomposition: split by helper family; otherwise REVIEW_REQUIRED.

## LR-02 — Consumer truth/payment/expiry

State: `PENDING` · Review Batch: B1
Worker: OpenCode; AGY only for a separately materialized UI/UX-only refinement if needed.
Objective: wire truthful states, remove F-2 merchant-name/amount invention, use authoritative hold amount/expiry, preserve safe static-QR behavior.
Acceptance: payment required + incomplete authority fails closed; no `?? 100`; no independent `900`; no invented merchant name.
AUTO_GATE: tests, lint, build, focused browser state proof, diff/security scan.
B1 boundary: Codex independent review on exact SHA.

## LR-03 — KMO DB contract

State: `PENDING` · Review Batch: B2 CRITICAL
Worker: OpenCode for implementation; Qwen may receive bounded SQL/test qualification Work Units.
Allowed: new paired patch/rollback files under `supabase/kmo-baseline/**`, tests, contract docs.
Required objects: `kmo_booking.intake_settings`, `service_intake_policy`, `booking_intake`, `booking_work_state` as locked by the plan.
Also close weekly fail-closed, staff-hours DB invariant and narrow predicate grants.
Acceptance: no broad grants; browser has no privileged table write; rollback is bounded; `public.orders`/production tables untouched.
AUTO_GATE: SQL/static checks, disposable non-prod apply/rollback when available, negative auth probes, diff check.
Critical boundary forces Codex B2 review before any runtime apply.

## LR-04 — Atomic capacity/reschedule/work-state RPC

State: `PENDING` · Review Batch: B2 CRITICAL
Worker: OpenCode; Qwen for concurrency/SQL probes.
Objective: server-derived unit snapshot, atomic appointment-date capacity, deterministic old/new date lock order, same-date correctness, authorized work-state transitions + audit.
Acceptance: concurrent operations cannot exceed capacity; reschedule reuses snapshot; failed operations no-op; work-state never mutates Order/production authority.
AUTO_GATE: DB-backed race tests + authorization/transition negative tests + fingerprint of protected public tables.
If LR-04 changes LR-03 reviewed SQL contract, B2 must be revalidated/reviewed on the new exact SHA.

## LR-05 — Admin surface

State: `PENDING` · Review Batch: B3
Workers: OpenCode for data/service wiring; AGY only for bounded UI/UX Work Units.
Objective: close F-1, dirty/save-all/leave guard, capacity settings, readiness, due/overdue and work-state actions.
Acceptance: unrelated admin mutation cannot erase unsaved schedule drafts; owner/admin-only lifecycle; no Order/Claim/Control UI.
AUTO_GATE: tests, lint, build, desktop/mobile admin proof, allowed-path diff.

## LR-06 — Isolated proof harness

State: `PENDING` · Review Batch: B3
Worker: Qwen for command-heavy evidence; OpenCode only for manifest-authorized fixture/test code if needed.
Required proof:
- all eight D1A intake/work scenarios;
- create/reschedule capacity races;
- same-date and cross-date release/consume;
- work transition invalid/unauthorized/cross-tenant denial;
- payment/expiry truth;
- bridge ambiguity fail closed;
- notification/provider failure does not corrupt Booking truth;
- external side effects suppressed;
- KMO protected-data fingerprint before/after;
- fixture residue zero;
- changed consumer/admin mobile + desktop evidence.
B3 boundary: Codex independent review of actual code and raw evidence.

## LR-08 — Runtime/release evidence boundary

State: `PENDING` · Review Batch: B4
Worker: Hermes/Qwen read-only verification by bounded dispatch.
Allowed automatically: read-only runtime inspection and explicitly isolated non-production proof.
Production schema apply/deploy/cutover: `OWNER_PRODUCTION_ACTION_REQUIRED`.
Any production request package must contain exact SHA, SQL/artifact, impact, rollback and post-action verification.

## LR-09 — Control-facing Booking contract

State: `PENDING` · Review Batch: B4
Worker: OpenCode documentation only.
Output: stable read contract, identifiers, privileged actions, authorization/failure semantics, payment/Booking/work-state meanings, bridge ambiguity behavior, unsupported actions/limitations, exact schema/source revision.
Must label Booking work-state as non-Order/non-production authority.

## LR-10 — Final audit / closure

State: `PENDING` · Review Batch: FINAL
Reviewer: fresh Codex independent review on exact final candidate.
Hermes then runs deterministic closure and persists final handoff.
PASS marker only with current evidence: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`.
No merge/deploy is implied.

## Review batches

### B1 — Consumer authority
Stages: LR-01, LR-02.
Critical attention: payment truth, error-vs-empty state, server expiry, KMO static QR.
On `BATCH_APPROVED`: LR-03.

### B2 — Database/security/concurrency
Stages: LR-03, LR-04.
Critical attention: KMO extension placement, grants/RLS, atomic capacity, reschedule, work-state authorization, protected public authority.
On `BATCH_APPROVED`: LR-05.

### B3 — Admin + complete proof
Stages: LR-05, LR-06.
Critical attention: F-1 draft preservation, admin authorization, end-to-end D1A proof and evidence freshness.
On `BATCH_APPROVED`: LR-08.

### B4 — Runtime evidence + adapter contract
Stages: LR-08, LR-09.
On `BATCH_APPROVED`: LR-10 final audit.

Every batch requires a Reviewer Evidence Packet. Report = review index, not trusted truth.

## Owner checkpoints

- source/contract authority conflict that cannot be resolved from SoT;
- request to touch parked/out-of-scope domains;
- production mutation/deploy/cutover;
- destructive/irreversible action;
- independent reviewer unavailable;
- unresolved substantive defect after authorized senior remediation;
- real-shop manual acceptance when automation cannot provide the required evidence.

Normal test failure, timeout and bounded technical defects are not Owner checkpoints.

## Materialization / stop rules

Hermes may materialize only from this locked manifest + deterministic current state. It may not invent stages, requirements, executor roles, architecture, acceptance criteria or authority.

Stop on SoT conflict, SHA/evidence mismatch, no safe timeout decomposition, role/provenance mismatch, scope boundary, reviewer STOP, or missing production authority.

Production readiness state requested by this run: NONE. Target is a D1 integration-readiness candidate only; `BUILD_PASS != PRODUCTION_READY != LIVE_PROVEN`.
