# MASTER EXECUTION BRIEF — KMO DOMAIN OPERATIONS → D1

Date: 2026-09-12
Status: `READY FOR RELAY PREFLIGHT`
Owner: Free
Commander / Final Reviewer: Sol
Owning Workstream: DOMAIN OPERATIONS
Top-level Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Target: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`

## Owner Authorization for Long-Running Shape
Owner approved this execution shape on 2026-09-12: Hermes may hold the Master Brief, materialize fresh per-stage dispatches, advance automatically after passed stage gates, and route bounded defects without returning to Owner after every agent round.

This approval authorizes the orchestration shape and Domain scope. It does **not** authorize secrets disclosure, unrelated work, Order/Claim, KMO Control implementation, unbounded production mutation, or cross-workstream integration before gates pass.

## Problem
KMO Booking has a verified Mac/provider execution context, but that closure proves runtime targeting only. It does not prove the Booking lifecycle, release evidence, domain contracts, or Control-facing read/action contract are stable enough for D1.

## User / Operational Goal
KMO staff and customers need the Booking flow to work reliably as an independent KMO deployment. KMO Control later needs a stable adapter contract without owning or duplicating Booking business logic.

## Accepted Baseline
- Accepted Domain closure commit: `671d8f078c5dda3ba510c61bf721ac8ae13eb2f0`.
- New task branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`.
- Prior runtime-context task is CLOSED and must not be reopened.
- Current readiness: `BOOKING_NOT_READY_FOR_CONTROL`.

## Scope
In scope:
- Booking customer frontend and admin/backend behavior required for KMO.
- scheduling, weekly closure, staff availability, special holidays, slot/write invariants.
- deposit/payment state that belongs to Booking.
- Booking-owned recovery/notification behavior.
- RLS/tenant/security checks for the Booking surface.
- tests, lint, typecheck/build as applicable, browser/mobile acceptance, release/runtime evidence.
- stable read contract, allowed privileged action contract, and verified identity/bridge mapping required by KMO Control.

Out of scope:
- KMO Control shell, LINE Front Desk control UI, Control auth/RBAC implementation.
- Order and Claim implementation (`NOT_AUTHORIZED_YET`).
- general KMO LINE conversation ownership redesign.
- universal shared customer primary key.
- edits to canonical upstream BK01 merely to make KMO pass; upstream findings must be recorded separately and changed only under separate authority.

## Architecture / Data Invariants
- `public.*` remains existing KMO operational domain.
- `local_service.*` remains BK01 generic booking domain.
- `kmo_booking.*` remains KMO-specific booking extension.
- `kmo_bridge.*` remains identity mapping/reconciliation/cutover boundary.
- `public.customers` and `local_service.customers` remain separate identities.
- Browser clients never receive service-role credentials.
- Privileged cross-schema writes use narrow authorized server/RPC paths.
- Permanent uncontrolled dual-write is forbidden.
- General KMO LINE conversation runtime is not owned by Booking.

## Source-of-Truth Rules
Read before substantive work:
1. `bk01-pilot/docs/tasks/TASK-KMO-DOMAIN-BOOKING-READINESS-001.md`.
2. this Master Brief.
3. `bk01-pilot/docs/relay/RELAY-PLAN-KMO-DOMAIN-TO-D1-2026-09-12.md`.
4. `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, `docs/DOCUMENTATION_INDEX.md`.
5. exact source, migrations, tests, Worker configs, and runtime evidence at the reviewed revision.
6. latest closure report/handoff for runtime targeting.

Historical reviews such as the 2026-09-09 mobile review are evidence/checklists only. Do not silently carry an old finding forward as an open defect unless current source/runtime reproduces it.

## Carry-Forward Areas To Re-verify, Not Assume
- recurring weekly schedule must fail closed when required configuration is missing.
- zero-staff / zero-slot / read-failure customer states must be truthful.
- shop weekly vs staff weekly precedence and save-failure behavior.
- mobile time input grammar and numeric editing behavior.
- special-holiday behavior and Booking create/reschedule enforcement.
- PromptPay/profile decoupling and payment readiness behavior.
- RLS, owner/admin allow, outsider/cross-tenant deny.
- generated-artifact secret scan and clean build ordering.
- real mobile/browser Booking flow and owner/shop acceptance.
- duplicate notification/OA behavior if still present.
- stable read/action/identity bridge contract for D1.

## Workflow
Lifecycle: `WF-DEV-01 v1.1.0`.
Long-running execution: `WF-RELAY-01 v1.2.0` with canonical `kanban-external-agent-dispatch v2.3.8` semantics.
Decision gaps only: `WF-COUNCIL-01 v1.0.0`.

## Long-Running Agent Policy
Hermes owns orchestration only: stage graph, checkpoint state, deterministic gates, evidence persistence, and routing. Hermes must not patch production code itself.

Primary implementation preference: AGY receives the first implementation pass for each material build stage **only after** current Relay readiness/capability admission supports the role. If AGY is not currently admissible for that stage, HOLD and report; do not silently substitute another agent.

Every material implementation stage is followed by fresh Codex `INDEPENDENT-QA` before Builder conclusions are revealed. QA may write only its report/authorized test artifacts and must not repair production code.

Defect routing after the first Codex report:
- SIMPLE: local/mechanical, bounded to locked behavior, no architecture/security/data-contract change, no risky migration/provider/concurrency semantics. Return once to AGY in `BUILD`/remediation context, then fresh Codex QA.
- HARD: auth/RLS, migration/data integrity, security invariant, cross-schema boundary, external-provider side effect, concurrency/idempotency, persistent multi-file failure, or defect still present after one AGY repair. Route explicitly to Claude for one consolidated remediation round, then fresh Codex QA.
- CONTRACT INVALID / DECISION GAP: STOP affected scope, persist the exact gap, route targeted Council/Owner decision, update canonical source of truth, then resume.

No unlimited repair loop. If Claude remediation plus fresh Codex QA still leaves a substantive defect, STOP for Sol/Owner escalation package rather than cycling agents indefinitely.

## Production Authority Boundary
Local/source/test changes are authorized within this task. A production deploy, schema apply, secret/token action, cron activation, or customer-impacting cutover requires explicit stage authority from an existing approved release decision or an Owner checkpoint. Absence of authority means STOP at `OWNER_PRODUCTION_ACTION_REQUIRED`; do not invent a workaround.

## Execution Stages
### Stage D0 — Relay Admission / Evidence Freeze
Hermes verifies canonical Relay runtime/hash, effective `HERMES_HOME`, exact branch/revision, clean target, Source of Truth readability, agent readiness, and path ownership. Workflow/runtime parity was independently re-verified on 2026-09-13: `WF-RELAY-01 v1.2.0` targets Relay `v2.3.8` and the macOS runtime guard passes. Substantive cards still require a fresh task-specific preflight.

### Stage D1 — AGY Primary Booking Readiness Pass
AGY reads the locked source set and exact current code, re-verifies current defects rather than trusting historical status, and implements the thinnest coherent Booking changes required to satisfy the D1 acceptance contract. It may update Booking source, migrations, tests, and Domain docs within allowed paths. No production apply/deploy unless separately authorized.

Required before AGY stop: relevant tests, lint, typecheck/build where applicable, `git diff --check`, secret/path hygiene, exact commit, clean or explicitly explained status, and a neutral stage handoff.

### Stage D2 — Codex Independent QA
Fresh Codex session, `Context Mode = INDEPENDENT-QA`. Target the exact AGY revision. Withhold AGY conclusions, expected verdict, changed-file hints, and prior PASS claims until Codex persists its first report.

Codex independently selects checks against requirements, source, migrations, tests, security boundaries, and the exact D1 acceptance trajectory. Verdict is PASS or a defect package with severity/evidence/acceptance condition. Codex does not fix findings.

### Stage D3 — Automatic Remediation Routing
Hermes classifies only by the locked routing contract. SIMPLE defects return once to AGY; HARD defects route to Claude; Decision Gaps stop for Council/Owner. Every remediation produces a new exact revision and is followed by fresh Codex verification.

### Stage D4 — Release / Runtime Evidence
After source QA passes, Hermes determines which remaining D1 evidence is runtime-only. Read-only checks may proceed automatically. If a production deploy/schema apply/cutover is required and no standing authority exists, STOP once at `OWNER_PRODUCTION_ACTION_REQUIRED` with exact action, rollback, expected impact, and verification plan.

After authorized runtime action, persist exact provider/version/schema evidence, post-action checks, logs/evidence references with secrets redacted, and confirm no unrelated cron/domain/notification activation.

### Stage D5 — Control-Facing Contract Lock
Without implementing Control, Domain documents the stable adapter-facing contract:
- Booking summary/read contract and stable identifiers.
- allowed privileged Booking actions, authorization boundary, and failure semantics.
- `kmo_bridge.*` / customer mapping semantics and ambiguity behavior.
- exposed Booking/deposit/payment states needed by Control.
- unsupported actions and known limitations.
- exact schema/source revision that owns each contract.

No Control UI, Control RPC, or cross-workstream implementation is created here.

### Stage D6 — Final D1 Codex Audit
Fresh Codex final audit compares the exact candidate revision/runtime evidence with D1 acceptance criteria, locked domain contracts, security boundaries, and the new adapter contract. Codex does not repair findings.

PASS marker: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`.
Failure returns through the same bounded remediation policy; contract-invalid findings stop for decision.

### Stage D7 — Hermes Deterministic Closure + Sol Final Verify
Hermes verifies exact git status, evidence paths, required deterministic tests/builds, adapter-contract artifacts, runtime evidence, and that Order/Claim/Control remained untouched. Persist final Domain handoff with exact SHA and limitations, then return the exact candidate once to Sol for the `WF-DEV-01` Final Verify. This is a Commander checkpoint, not an Owner approval checkpoint.

Sol PASS locks `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`. A Sol defect returns through the same bounded remediation/QA path.

### Stage D8 — Convergence Wait
Do not create an Integration Task. Park at `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` until the Control workstream reaches `CONTROL_ADAPTER_READY_CANDIDATE = PASS`.

## D1 Acceptance Criteria
All must be evidenced on an exact revision/runtime:
1. KMO Booking lifecycle needed by the shop is runnable through the intended customer/admin paths.
2. scheduling precedence, recurring weekly closure, staff availability, holidays, create/reschedule rules, and collision behavior are deterministic and fail closed where required.
3. deposit/payment state belonging to Booking is stable and does not silently overwrite confirmed business truth.
4. relevant schema/data contract is stable; no unresolved migration/RLS/tenant defect changes the Control adapter contract.
5. bridge/customer-mapping contract is stable and ambiguity fails closed/manual review.
6. Control-facing read contract is documented and testable.
7. allowed privileged action contract is documented with authorization/failure semantics.
8. exact branch + SHA, tests/security/build/runtime evidence, and known limitations are attached.
9. no unresolved blocker remains that would force Control to guess Booking behavior or table structure.
10. Order and Claim remain `NOT_AUTHORIZED_YET` and no Control implementation was added.

## Failure Cases That Must Be Covered
- missing/invalid weekly schedule configuration.
- zero staff, zero services/slots, and provider/read failure.
- stale or conflicting staff/shop schedule writes.
- duplicate/retried booking/deposit/notification operations.
- authorization denial and cross-tenant attempts.
- migration/apply partial failure and rollback/reconciliation.
- provider outage or notification failure without corrupting Booking truth.
- generated artifact containing a real secret value.

## Security / Evidence Requirements
No hard-coded credentials; no service-role/browser leakage; exact-value secret scans where builds generate deployable artifacts; RLS/tenant denial evidence; controlled privileged writes; error handling/logging without secrets; release evidence tied to exact revision/provider version; no PASS without evidence.

## Owner/Sol Stop Points
Return to Owner only for: material decision gap; production action lacking standing authority; real manual shop/mobile acceptance that cannot be delegated; critical unresolved defect after Claude; or final dual-workstream convergence. Sol Commander review may still occur where the pinned workflow requires Final Verify; ordinary stage PASS/defects/remediation do not return to Owner.
