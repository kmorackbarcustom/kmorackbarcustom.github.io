# RELAY PLAN — KMO DOMAIN OPERATIONS → D1

Date: 2026-09-12
Status: `READY FOR RELAY PREFLIGHT`
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Owner-approved relay shape: YES

## Relay Contract
- Workflow wrapper: `WF-RELAY-01 v1.2.0`.
- Canonical runtime observed on Mac: `kanban-external-agent-dispatch v2.3.8`.
- Workflow/runtime parity is verified: active Registry/`WF-RELAY-01` points to canonical Relay `v2.3.8`.
- macOS runtime guard passed on 2026-09-13. Before substantive dispatch, Hermes must still persist a fresh task-specific runtime snapshot/version/hash and full executor readiness evidence.
- Top-level Work Type: `OTHER` — explicitly Owner-approved mixed long-running verify/build/contract-readiness program.
- Release Policy: `RELAY_STANDARD`.
- Failure behavior: `STOP`.

## Target Workspace / Git
Workspace: `/tmp/kmo-domain-booking-readiness`
Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
Base: `671d8f078c5dda3ba510c61bf721ac8ae13eb2f0`
Final target: exact task-branch candidate revision; never `latest`.

## Allowed Write Scope
- `bk01-pilot/apps/booking-consumer/**`
- `bk01-pilot/apps/booking-admin/**`
- `bk01-pilot/supabase/**`
- `bk01-pilot/tests/**`
- `bk01-pilot/scripts/**` only when required by Booking verification/release hygiene.
- `bk01-pilot/docs/**` for this Task, evidence, and Domain contracts.

## Prohibited Write Scope
- KMO Control application paths or Control-owned schemas/contracts.
- Order / Claim implementation paths except read-only evidence needed to prove non-interference.
- unrelated root KMO production surfaces.
- Relay evidence/runtime directories except runtime-owned evidence outputs.
- secrets, `.env*`, token values, credential stores.

## Mandatory Preflight
Hermes must persist:
- canonical skill path/version/SHA-256 and fresh runtime snapshot.
- effective `HERMES_HOME` and macOS runtime guard PASS.
- exact Task/Master Brief/Relay Plan hashes.
- exact workspace/branch/base and clean/understood status.
- `Work Type = OTHER`, Owner approval evidence, `Release Policy = RELAY_STANDARD`.
- role -> selected agent, context mode, QA mode.
- direct-executor readiness for every agent before substantive dispatch: executable, auth/session, invocation sentinel, provenance.
- no overlapping write scopes; planned parallelism = NONE unless a later explicit plan proves independence.

## Default Role Routing
- `CORE-BUILDER`: AGY first-pass preference by Owner, contingent on current capability/readiness evidence for the stage.
- `STAGE-QA`: Codex, fresh `INDEPENDENT-QA` first report.
- `REMEDIATION-BUILDER-SIMPLE`: AGY, maximum one repair round per defect package.
- `REMEDIATION-BUILDER-HARD`: Claude, explicitly re-planned from Codex defect class.
- `FINAL-AUDITOR`: Codex in a fresh final-audit context.
- Hermes: orchestrator/integration verifier only; never patcher.

No silent agent substitution. If a mandated/preferred agent cannot pass readiness/capability admission, HOLD and record the reason.

## Ordered Stage Graph
`D0 PREFLIGHT`
→ `D1 AGY BUILD`
→ deterministic stage gate
→ `D2 CODEX INDEPENDENT-QA`
→ PASS: continue
→ SIMPLE defects: `D3A AGY REMEDIATION` → fresh `D2R CODEX QA`
→ HARD defects: `D3B CLAUDE REMEDIATION` → fresh `D2R CODEX QA`
→ Decision Gap: targeted Council/Owner → update SoT → resume affected node
→ `D4 RUNTIME/RELEASE EVIDENCE`
→ `D5 CONTROL-FACING CONTRACT LOCK`
→ `D6 CODEX FINAL AUDIT`
→ `D7 HERMES FINAL INTEGRATION VERIFY`
→ `D7S SOL FINAL VERIFY`
→ PASS: `D8 BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS / PARKED`

Each material node gets a fresh WSTERA Agent Dispatch Packet with Task ID, exact revision, allowed/prohibited paths, verification contract, return contract, and explicit stop. Hermes may materialize these packets automatically from this approved graph; packets may not be reused across stages.

## Codex Independence Rule
Before each first-pass `INDEPENDENT-QA`, withhold Builder conclusions, prior PASS claims, suspected defect hints, implementation rationale, changed-file hints, and expected verdict. Codex receives requirements, neutral setup, exact target revision, allowed evidence scope, and source needed to test. Persist first report before informed remediation context is released.

## Defect Routing Decision
SIMPLE only if all are true: behavior is already locked; change is mechanical/local; no migration/data/security/RLS/provider/concurrency/cross-domain semantic change; no new Owner decision; and one bounded AGY repair can close it.

Anything else is HARD or DECISION GAP. HARD goes once to Claude with the entire consolidated defect package. Decision Gap stops the affected chain and uses Council/Owner; agents may not invent a policy to keep moving.

## Deterministic Stage Gates
At minimum, where applicable to the changed surface:
- required unit/integration/DB tests with exact counts/results.
- lint, typecheck, production build.
- `git diff --check` and allowed-path diff.
- migration/RLS/tenant checks.
- exact-value deploy-artifact secret scan.
- branch/revision/status evidence.
- runtime/provider verification after any authorized deployment.

A stage with a failing required check does not auto-promote.

## Owner / Sol Checkpoints
Hermes may continue without Owner after ordinary PASS or bounded defect routing. A pinned `WF-DEV-01` milestone still requires one Sol Final Verify before closure. It must stop the Owner path when:
- a material business/architecture/security/data decision is undefined.
- a production/customer-impacting action lacks standing authority.
- real shop/mobile manual acceptance requires Owner participation.
- Claude remediation still leaves a substantive blocker.
- both Domain and Control candidates are ready for the final convergence decision.

## Completion Contract
The Relay top-level result is not `done`. Final Domain semantic marker is:
`BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`

Required closure evidence: exact final SHA; changed files; all checks/results; QA/final-audit reports; runtime/deploy evidence where applicable; adapter/read/action/identity contract paths; blockers/limitations; clean or explicitly justified Git status; confirmation that Order/Claim/Control were untouched.

After candidate PASS, park the chain. Do not create `KMO-INTEGRATION-BOOKING-001` until the convergence contract says both workstreams are ready and Owner/Sol opens Integration.
