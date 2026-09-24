# BRIEF — KMO BK01 D1A LONG-RUN EXECUTION

Date: 2026-09-24 (Asia/Bangkok)
Task ID: `KMO-DOMAIN-BOOKING-READINESS-001`
Owner: Free
Assigned Orchestrator: Hermes
Target: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`

## Owner authorization event

Receipt of this brief from Owner authorizes:
- the corrected long-run plan;
- the exact Run Manifest stage graph/budgets;
- the workflow re-pin for this still-unstarted D1A execution;
- source/test/SQL/document implementation inside the locked scope;
- automatic continuation through pre-approved stages and bounded remediation.

It does NOT authorize production schema apply, deploy, cutover, destructive action, Order, Claim, KMO Control, canonical BK01 mutation, or changes to global agent/model/runtime configuration.

## Repository / base

Repo: `kmorackbarcustom/kmorackbarcustom.github.io`
Prepared package ref: `refs/tags/kmo-bk01-d1a-longrun-prepared-20260924`
Verified evidence anchor: `30c7e44ad86bc462683b97dab417cb22388bb908`
Expected Domain target before start: `058fe5211c9eb39d7dda3087ec40b1e896227113`
Create branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`
Create a dedicated worktree under `D:\AI-Workspace\runtime\worktrees\`.

Resolve the prepared tag to an exact SHA first. Verify it descends from the evidence anchor and that the delta after the anchor is documentation-only. Create the implementation branch from that resolved tag target.

If the Domain branch has advanced from the expected SHA, HOLD before product edits and reconcile the source delta. Do not silently choose a newer base.

## Read and execute in this order

1. `bk01-pilot/docs/REPORT-SOL-KMO-BK01-SEED-ADOPTION-INDEPENDENT-VERIFICATION-2026-09-24.md`
2. `bk01-pilot/docs/PLAN-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md`
3. `bk01-pilot/docs/RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md`
4. `bk01-pilot/docs/tasks/TASK-KMO-DOMAIN-BOOKING-READINESS-001.md`
5. `bk01-pilot/docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`
6. `bk01-pilot/docs/REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`
7. `bk01-pilot/KMO_SCHEMA_CONTRACT.md`
8. `bk01-pilot/KMO_EXTENSION_DESIGN.md`
9. exact active source/tests/SQL at the execution revision;
10. Seed Pack under `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/**` as READ-ONLY reference.

Do not execute the prior one-shot plan as a competing worklist.

## Workflow pin

- Workflow Registry: `1.6.0`
- `WF-DEV-01 v1.4.0`
- Execution Mode: `LONG_RUN`
- compose with `WF-RELAY-01 v1.3.0`
- Relay runtime: `kanban-external-agent-dispatch v2.5.3`
- workflow authority inspected: `Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a`

Role authority:
Hermes orchestrates; OpenCode is ordinary builder; AGY is UI/UX-only; Qwen is test/SQL/bounded remediation support; Codex is independent reviewer; Claude is senior difficult remediation only unless valid independent-review fallback conditions are met.

## Mandatory first action — no product patch yet

1. Verify repo, base SHA, Domain tip and clean source.
2. Create the exact branch/worktree.
3. Update Task checkpoint to pin `WF-DEV-01 v1.4.0 / LONG_RUN` + Relay composition for the unstarted D1A run.
4. Copy/bind the Run Manifest to the new execution revision, set `Manifest Status = LOCKED`, `Owner Approval = YES`, and persist an activation commit.
5. Run fresh Relay and required-executor preflight.
6. Prove effective Codex reviewer provenance/model = `gpt-5.6-luna`.
7. Do not edit global Codex config if a stale unsupported default such as `gpt-6-luna` is found. Resolve only through the authorized runtime/per-dispatch mechanism; otherwise HOLD as executor-not-ready.
8. Record baseline tests/lint/build and worktree state.

Only after LR-00 PASS may Hermes materialize LR-01.

## Execution behavior

Run the locked Manifest continuously.

Normal technical blockers:
- use the manifest's bounded local remediation budget;
- fix within authorized scope and rerun the exact failed gate;
- continue automatically when gates/reviews permit.

Do not return to Owner after routine Work Units, test failures, local fixes, provisional passes or reviewer-approved bounded worker fixes.

At each material stage:
- persist exact SHA and evidence;
- update Task/Run state;
- materialize a fresh revision-bound dispatch;
- never reuse an old dispatch for a different stage.

## Critical scope rules

### Booking intake
- capacity applies to appointment date only;
- KMO-specific settings/policies/snapshots live under `kmo_booking.*`;
- public clients cannot supply arbitrary intake units;
- create/reschedule authority is atomic/server-side;
- reschedule uses the stored booking snapshot and deterministic date-lock order.

### Booking work state
- allowed states: `WAITING_TO_START -> IN_PROGRESS -> COMPLETED`;
- invalid reverse/skip transitions fail closed;
- owner/admin authorization only for D1A;
- accepted transitions are auditable;
- this is Booking operational state only.

### Protected KMO authority
- `public.orders` remains KMO Order/job authority;
- `public.production_allocations` remains production scheduling authority;
- no write, mirror, replacement or dual-write to either from this Task;
- Order and Claim remain `NOT_AUTHORIZED_YET`;
- Portal/root-route change is parked;
- KMO Control implementation is prohibited.

Any required violation of these rules is a contract boundary, not a repair opportunity: STOP and return an exact Owner decision package.

## Independent review

Use the Run Manifest review batches.
Codex reviews actual source/diff/raw evidence at exact SHA; reports are indexes, not trusted truth.
Critical DB/RLS/payment/capacity/concurrency/work-state boundary must receive independent review before runtime apply.
No self-review and no reviewer shopping.

## Production boundary

This run is authorized to produce source, SQL patch/rollback, tests, local/isolated evidence and D1 candidate artifacts.

It is not authorized to mutate production.

If production DB apply/deploy/cutover becomes necessary:
- stop once at `OWNER_PRODUCTION_ACTION_REQUIRED`;
- return exact candidate SHA;
- exact SQL/artifact;
- expected impact;
- rollback;
- pre/post verification;
- current test/review evidence.

After Owner authorization, resume from the exact declared stage. Do not infer authorization from prior deploy history.

## Required final evidence

At minimum:
- `npm test`
- `npm run lint`
- `npm run build`
- DB-backed schedule/capacity/lifecycle/security tests
- create/reschedule concurrency proof
- D1A eight intake/work scenarios
- tenant/outsider denial
- bridge ambiguity fail closed
- notification failure does not corrupt Booking truth
- mobile/desktop evidence on changed surfaces
- protected public-table fingerprint/non-interference
- `git diff --check`
- allowed-path audit
- exact-value secret scan of generated/deployable artifacts
- exact revision + worktree state
- Control-facing Booking contract
- final independent review.

## Stop / return contract

Allowed terminal states:
- `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`
- `OWNER_PRODUCTION_ACTION_REQUIRED`
- `OWNER_DECISION_REQUIRED`
- `INDEPENDENT_REVIEW_UNAVAILABLE`
- `BLOCKED_<EXACT_REASON>`
- `STOP`

Return must include:
- Repo
- Branch
- Worktree
- Base SHA
- Final/current SHA
- Workflow + mode + runtime provenance
- DONE
- VERIFIED
- REMAINING
- BLOCKERS
- DECISIONS
- review verdicts/evidence paths
- git/worktree status
- NEXT ACTION

No merge to the Domain target, no deployment, and no claim of `PRODUCTION_READY` or `LIVE_PROVEN` unless separately authorized and evidenced.

## Expected first checkpoint

`LR-00 PREFLIGHT = PASS / RUN MANIFEST LOCKED / READY FOR LR-01`

If LR-00 cannot pass, stop before product edits and report the exact failed preflight condition.
