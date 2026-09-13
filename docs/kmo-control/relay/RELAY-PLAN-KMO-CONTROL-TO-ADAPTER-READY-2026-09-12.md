# RELAY PLAN — KMO CONTROL → ADAPTER READY

Date: 2026-09-12
Status: `READY FOR RELAY PREFLIGHT`
Owner-approved long-running shape: YES

## Program Execution Model
This is one Hermes-held Master Run across multiple governed stages/tasks. It does not collapse Risk Remediation, Council gates, and `KMO-CONTROL-001` into one implementation Task.

Phase A — Risk Remediation:
- Task: `KMO-CONTROL-RISK-REMEDIATION-001`.
- Lifecycle: `WF-DEV-01 v1.1.0`.
- Relay top-level work type: `OTHER` with explicit Owner approval.
- Release policy: `RELAY_STANDARD`.

Phase B — Gate transition:
- Pre-Build + Implementation Gate: `WF-COUNCIL-01 v1.0.0` Decision Mode.
- Hermes may invoke these sequentially when prerequisites in Master Brief pass.

Phase C/D — Control Build:
- Task: `KMO-CONTROL-001`, created only after Implementation Gate PASS + Owner Build Approval YES.
- Relay work type: `COUNCIL-BUILD`.
- Release policy: `COUNCIL_RELEASE`.

## Runtime Lock
Workflow/runtime parity is resolved: `WF-RELAY-01 v1.2.0` targets canonical `kanban-external-agent-dispatch v2.3.8`. The macOS runtime guard passed on 2026-09-13. Each substantive stage still requires a fresh runtime snapshot/path/version/hash plus named-executor readiness before release.

## Phase A Workspace / Git
Workspace: `/tmp/kmo-control-risk-remediation`
Branch: `task/KMO-CONTROL-RISK-REMEDIATION-001`
Base: `d98db98ccdb67328b62ea2958994923c942552fb`
Current plan-lock SHA: use exact committed revision after this Relay Plan is persisted.

Allowed writes for Phase A:
- `docs/kmo-control/**`.
- narrowly scoped KMO root `supabase/**` evidence/remediation changes only when explicitly required by one of the six locked items and authorized by dispatch.
- runtime evidence outputs in runtime-owned evidence directories.

Prohibited in Phase A:
- `kmo-control/` feature implementation.
- Booking/Order/Claim implementation or adapter code.
- feature deploy/migration.
- secrets/credential values in Git, docs, prompts, output, or evidence.

## Mandatory Relay Preflight
Persist before substantive execution:
- canonical Relay path/version/SHA-256 + fresh-session snapshot.
- macOS `assert-relay-runtime.py` PASS and effective `HERMES_HOME`.
- exact Source of Truth hashes and git target/status.
- Owner approval evidence for `OTHER` shape.
- allowed/prohibited paths and stage graph.
- role -> selected agent and context mode.
- readiness for AGY, Codex, Claude when each becomes mandatory: executable, auth/session, invocation sentinel, provenance.
- parallelism = NONE by default; stages share state and must be dependency-gated.
- failure behavior = STOP.

## Agent Routing
Capability role comes first; selected identity is recorded per dispatch.

Owner routing preference:
- first implementation/remediation pass: AGY when admitted by current readiness/capability evidence.
- independent stage QA: Codex.
- simple bounded repair after Codex: AGY once.
- hard/substantive remediation: Claude once with consolidated defect package.
- Council experts/synthesizer follow the canonical Council runtime and are not replaced by this Relay routing policy.

No silent fallback/substitution. If AGY is not admissible for a stage, HOLD or explicitly re-plan from evidence; do not relabel another agent as AGY.

## Defect Classes
SIMPLE = locked behavior, local/mechanical change, no auth/RBAC/security/data migration/provider/concurrency/cross-domain semantic change, no decision gap, one bounded repair.

HARD = auth/RBAC, RLS/privilege, migration/data integrity, secret handling, external provider side effect, idempotency/concurrency, multi-surface persistent defect, or failure remaining after one AGY repair.

DECISION GAP = any undefined choice that can change architecture, security invariant, business behavior, data contract, identity semantics, or critical release contract. Stop and use Council/Owner.

## QA Contract
Every material implementation stage gets fresh Codex `INDEPENDENT-QA`. Withhold Builder conclusions, PASS claims, suspected defect hints, prior test results, implementation rationale, changed-file hints, and expected verdict until the first report is persisted. QA may not patch production code.

## Ordered Graph — Phase A / B
`C0A PREFLIGHT`
→ `C0B AGY RISK REMEDIATION`
→ deterministic evidence gate
→ `C0C CODEX INDEPENDENT-QA`
→ PASS: continue
→ SIMPLE: AGY repair once → fresh Codex QA
→ HARD: Claude remediation once → fresh Codex QA
→ Decision Gap: Council/Owner → update SoT → resume
→ `C0D HERMES RISK CLOSURE VERIFY`
→ `C0S SOL FINAL VERIFY`
→ PASS: `PRE-BUILD COUNCIL`
→ PASS: `IMPLEMENTATION GATE COUNCIL`
→ PASS: `OWNER_BUILD_APPROVAL_REQUIRED`
→ Owner YES: materialize `KMO-CONTROL-001` build packet and branch

If Pre-Build returns bounded REMEDIATE, allow one bounded WF-DEV/Relay remediation cycle and rerun the gate. A second substantive REMEDIATE or a contract-invalid finding stops for Sol/Owner. No indefinite gate loop.

## Ordered Graph — Phase C
For each material stage C1, C2, C3:
`AGY BUILD` when admitted
→ deterministic stage gate
→ `CODEX INDEPENDENT-QA`
→ PASS: next material stage
→ SIMPLE: AGY repair once → fresh Codex QA
→ HARD: Claude remediation once → fresh Codex QA
→ Decision Gap: Council/Owner
→ remaining substantive defect after Claude: STOP escalation

Hermes creates a fresh dispatch for every node and updates the Task checkpoint after every material return. Dispatches are never recycled across stages.

## Ordered Graph — Phase D Closure
After C1/C2/C3 stage QA:
`HERMES DETERMINISTIC INTEGRATION VERIFY`
→ `COUNCIL RELEASE VERIFICATION MODE`
→ PASS
→ native `request-review`
→ marker `READY_FOR_GPT_REVIEW`
→ program marker `CONTROL_ADAPTER_READY_CANDIDATE = PASS`
→ PARK / convergence wait

Because `release_policy=COUNCIL_RELEASE`, do not add Codex as a substantive final auditor immediately before Council Release. Codex remains stage QA; the Release Council owns final semantic closure.

## Deterministic Gates
Where applicable: tests; lint; typecheck; production build; migration/RLS/privilege checks; secret scans; exact allowed-path diff; `git diff --check`; runtime/provider verification; Release Evidence Standard artifacts; exact revision/status.

A failed mandatory check blocks dependent promotion. Hermes may not patch a failure.

## Owner / Sol Stops
Owner interruption is required only for: Owner-controlled token action; Decision Gap; `OWNER_BUILD_APPROVAL_REQUIRED`; unauthorized production/customer-impacting action; critical unresolved defect after Claude; or final convergence.

A Sol Commander Final Verify may occur where the pinned workflow requires it; this is not an Owner interruption.

## Convergence Contract
If Domain candidate is not PASS, park Control. If Domain has `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`, return one combined checkpoint:
`READY TO OPEN KMO-INTEGRATION-BOOKING-001`.

Do not create/execute Integration automatically before Sol/Owner convergence review.
