# RUN MANIFEST — KMO-DOMAIN-BOOKING-READINESS-001

Manifest Status: **LOCKED** — ACTIVATED AT LR-00 (2026-09-24)
Task ID: `KMO-DOMAIN-BOOKING-READINESS-001`
Workflow: `WF-DEV-01 v1.4.0`
Execution Mode: `LONG_RUN`
Workflow Registry: `1.6.0`
Owner Approval: **YES** — Owner forwarded the paired execution brief and separately ruled the two deviations below
Repository: `kmorackbarcustom/kmorackbarcustom.github.io`
Implementation Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`
Prepared Base Ref: `refs/tags/kmo-bk01-d1a-longrun-prepared-20260924`
Verified Evidence Anchor SHA: `30c7e44ad86bc462683b97dab417cb22388bb908`
Resolved Base SHA: `ac3c14746d87e2a6038d63e39715f30a8384b598`
Merge Target: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
Runtime Procedure (review/escalation rail): `WF-RELAY-01 v1.3.0 / kanban-external-agent-dispatch v2.5.4`
Execution Engine (D1A worker lanes): `hermes-native-swarm v0.1.1`
Independent Reviewer (this run): `agent-claude`
Workflow Authority: `Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a`

## Owner-ruled deviations from the brief's default pin (2026-09-24)

Owner forwarded `BRIEF-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md` and additionally ruled:

| # | Brief default | Owner ruling | Bounded to |
|---|---|---|---|
| D-1 | Worker execution through Relay-dispatched external CLI builders | Worker lanes execute on `hermes-native-swarm` capability-class workers via `swarmctl` | this D1A run only |
| D-2 | `PRIMARY_REVIEWER = Codex` (`codex_model_pin: gpt-5.6-luna`) | `agent-claude` is the independent batch reviewer (role `INDEPENDENT_BATCH_REVIEWER`) | this D1A run only |

### D-2 evidence — Codex reviewer unavailability

```text
agent-codex readiness  = DIRECT_EXECUTOR_NOT_READY:agent-codex:sandbox_execution_failed
raw sandbox probe rc   = 3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED)
model access control   = codex exec --sandbox read-only -m gpt-6-luna -> exit 0, exact READY
```

The failure is the known host session-0 restricted-token child-launch condition, not a model-pin fault.
`policies/INDEPENDENT-REVIEW-POLICY.md` permits fallback reviewer selection on evidenced
`EXECUTOR_NOT_READY`; that condition is met and recorded. Claude has authored no substantive
D1A scope, so `REVIEWER != AUTHOR_OF_TARGET_DIFF` holds at activation.

### Model-pin divergence recorded (not repaired here)

The brief/plan pin `gpt-5.6-luna`; workflow registry `c8f41ac` also says `gpt-5.6-luna`; installed Relay runtime
`v2.5.4` enforces `PIN_CODEX = openai / gpt-6-luna / reasoning_effort=medium` and both wrappers fail closed on mismatch.
Both models are live-usable on this host. This Task must not repair global Codex configuration, so the divergence is
recorded as provenance and is not resolved by this run.

## Activation contract

Before any product edit, Hermes must:
1. verify the exact base and Domain tip;
2. create the implementation branch/worktree from the exact base;
3. persist the Task workflow re-pin and current checkpoint;
4. bind this manifest to the activation commit, change status to `LOCKED`, and record Owner Approval = YES;
5. pass fresh engine + named-executor preflight.

Activation state at LR-00: items 1–4 completed; item 5 partially completed —
swarm pool/header/limits validation PASS, `agent-claude` readiness PASS, `agent-codex` readiness FAIL (recorded above),
`agent-opencode` readiness FAIL (provider auth 401). See `LR-00-PREFLIGHT-EVIDENCE-2026-09-24.md`.

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
primary_reviewer: Codex            # unavailable on this host at LR-00 — see D-2
active_reviewer_this_run: agent-claude
codex_model_pin: gpt-5.6-luna      # brief/registry pin; installed runtime v2.5.4 enforces gpt-6-luna
fallback_reviewer: Claude
fallback_only_when_primary_unavailable: true
no_self_review: true
no_reviewer_shopping: true
```

Codex effective model/provenance must be proven at preflight. This Task must not repair global Codex configuration. A stale/unsupported default is an executor-readiness issue, not product scope.

## Engine / worker assignment (Owner-ruled D-1)

Worker lanes execute on the native swarm pool. One work unit = one capability class = one worker.

| Stage | Capability class | Worker profile | Notes |
|---|---|---|---|
| LR-00 | `inspection` | `swarm-inspector` | Hermes also runs controller-side checks |
| LR-01 | `implementation` | `swarm-builder` | pure helpers + focused tests |
| LR-02 | `implementation` / `ui_ux` | `swarm-builder`; AGY only for a separately materialized UI/UX-only unit | consumer truth/payment/expiry + F-2 |
| LR-03 | `database_qualification` + `implementation` | `swarm-db` for SQL qualification, `swarm-builder` for the paired patch/rollback files | no runtime apply |
| LR-04 | `implementation` + `database_qualification` | `swarm-builder`; `swarm-db` for concurrency/SQL probes | atomic capacity/reschedule/work-state |
| LR-05 | `implementation` | `swarm-builder` | admin surface + F-1 (AGY only for bounded UI/UX units) |
| LR-06 | `testing` + `evidence_preparation` | `swarm-tester`, `swarm-evidence` | proof harness + browser/mobile evidence |
| LR-08 | `inspection` | `swarm-inspector` | read-only runtime verification |
| LR-09 | `evidence_preparation` | `swarm-evidence` | Control-facing Booking contract (documentation) |
| LR-10 | reviewer stage | `agent-claude` (Relay rail) | final independent audit |

Swarm V0.1 hard limits that bind this run:

```text
max_concurrent_workers = 3
max_spawn_depth = 1
worker_self_delegation = forbidden
worker_self_approval = forbidden
cross_lane_mutable_workspace_sharing = forbidden
ordinary_agent_relay_execution = forbidden
```

Consequence: the native swarm ceiling is `SWARM_REVIEW_REQUIRED`. It can never self-approve. Stage review, escalation
and final audit therefore run on the Relay rail (`agent-claude`), not inside the swarm.

Because a work unit maps to exactly one capability class, composite stages above must be split into separate
revision-bound work units before dispatch.

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

State: `PASS` (2026-09-24) — see `LR-00-PREFLIGHT-EVIDENCE-2026-09-24.md`
Worker: `swarm-inspector` (read-only preflight lane) + Hermes controller-side checks; no product patch.
Acceptance:
- [x] prepared tag resolves to an exact base SHA that descends from `30c7e44`, with documentation-only delta after that evidence anchor, and clean worktree;
- [x] current Domain target still `058fe52` (local = origin), no reconciliation required;
- [x] registry/spec/runtime provenance verified;
- [x] named-executor readiness checked for only the roles needed — `agent-claude` READY; `agent-codex` NOT_READY (recorded, D-2 fallback); `agent-opencode` NOT_READY (not used as a lane in this run);
- [x] Task/manifest activation commit persisted;
- [x] baseline commands and allowed paths recorded.
AUTO_GATE: git identity/status, workflow/runtime versions, swarm pool/header/limits validation, executor readiness, Source of Truth readability.
Stop: any drift/authority conflict => `BLOCKED`.

## LR-01 — Pure helper adaptation

State: `PENDING` · Review Batch: B1
Worker: `swarm-builder` (capability `implementation`).
Allowed: consumer/admin `src/lib/**`, focused tests, message keys only when required.
Objective: adapt truthful state/load-result/payment/readiness/schedule helpers without wiring routes.
Acceptance: unit tests for KMO semantics; no active route behavior change yet.
AUTO_GATE: focused tests + full `npm test` + allowed-path diff.
Timeout decomposition: split by helper family; otherwise REVIEW_REQUIRED.

## LR-02 — Consumer truth/payment/expiry

State: `PENDING` · Review Batch: B1
Worker: `swarm-builder`; AGY only for a separately materialized UI/UX-only refinement if needed.
Objective: wire truthful states, remove F-2 merchant-name/amount invention, use authoritative hold amount/expiry, preserve safe static-QR behavior.
Acceptance: payment required + incomplete authority fails closed; no `?? 100`; no independent `900`; no invented merchant name.
AUTO_GATE: tests, lint, build, focused browser state proof, diff/security scan.
B1 boundary: Codex independent review on exact SHA.

## LR-03 — KMO DB contract

State: `PENDING` · Review Batch: B2 CRITICAL
Worker: `swarm-builder` for implementation; `swarm-db` may receive bounded SQL/test qualification work units.
Allowed: new paired patch/rollback files under `supabase/kmo-baseline/**`, tests, contract docs.
Required objects: `kmo_booking.intake_settings`, `service_intake_policy`, `booking_intake`, `booking_work_state` as locked by the plan.
Also close weekly fail-closed, staff-hours DB invariant and narrow predicate grants.
Acceptance: no broad grants; browser has no privileged table write; rollback is bounded; `public.orders`/production tables untouched.
AUTO_GATE: SQL/static checks, disposable non-prod apply/rollback when available, negative auth probes, diff check.
Critical boundary forces Codex B2 review before any runtime apply.

## LR-04 — Atomic capacity/reschedule/work-state RPC

State: `PENDING` · Review Batch: B2 CRITICAL
Worker: `swarm-builder`; `swarm-db` for concurrency/SQL probes.
Objective: server-derived unit snapshot, atomic appointment-date capacity, deterministic old/new date lock order, same-date correctness, authorized work-state transitions + audit.
Acceptance: concurrent operations cannot exceed capacity; reschedule reuses snapshot; failed operations no-op; work-state never mutates Order/production authority.
AUTO_GATE: DB-backed race tests + authorization/transition negative tests + fingerprint of protected public tables.
If LR-04 changes LR-03 reviewed SQL contract, B2 must be revalidated/reviewed on the new exact SHA.

## LR-05 — Admin surface

State: `PENDING` · Review Batch: B3
Workers: `swarm-builder` for data/service wiring; AGY only for bounded UI/UX Work Units.
Objective: close F-1, dirty/save-all/leave guard, capacity settings, readiness, due/overdue and work-state actions.
Acceptance: unrelated admin mutation cannot erase unsaved schedule drafts; owner/admin-only lifecycle; no Order/Claim/Control UI.
AUTO_GATE: tests, lint, build, desktop/mobile admin proof, allowed-path diff.

## LR-06 — Isolated proof harness

State: `PENDING` · Review Batch: B3
Worker: `swarm-tester` for command-heavy evidence; `swarm-builder` only for manifest-authorized fixture/test code if needed.
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
Worker: `swarm-evidence` documentation only.
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
