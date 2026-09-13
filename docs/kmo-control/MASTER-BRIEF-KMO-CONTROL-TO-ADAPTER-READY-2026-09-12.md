# MASTER EXECUTION BRIEF — KMO CONTROL → ADAPTER READY

Date: 2026-09-12
Status: `READY FOR RELAY PREFLIGHT`
Owner: Free
Commander / Final Reviewer: Sol
Owning Workstream: KMO CONTROL
Current Task: `KMO-CONTROL-RISK-REMEDIATION-001`
Later Build Task: `KMO-CONTROL-001` only after Implementation Gate PASS + Owner Build Approval YES
Target: `CONTROL_ADAPTER_READY_CANDIDATE = PASS`

## Owner Authorization for Long-Running Shape
Owner approved this execution shape on 2026-09-12: Hermes may hold the Master Brief, materialize fresh stage dispatches, advance automatically after passed stage gates, invoke the already-planned Pre-Build and Implementation Council gates when their prerequisites are satisfied, and route bounded defects without returning to Owner after every agent round.

This authorization does **not** waive mandatory Owner Build Approval before C1, does not authorize Booking/Order/Claim integration, and does not grant unbounded production mutation or secret handling.

## Problem
KMO Control Architecture is PASS but the Risk/Invariant Gate returned `REMEDIATE`. Six bounded remediation items must close before Pre-Build. After that, Control must pass Pre-Build and Implementation Gate, receive Owner Build Approval, then build C1 Foundation, C2 LINE Front Desk, and C3 Customer 360/adapter shell without implementing Domain business logic.

## User / Operational Goal
KMO staff need a secure Control center with attributable staff access, durable LINE conversation truth, deterministic AI/HUMAN ownership, staff reply/recovery/audit, and adapter slots that can later consume verified Booking/Order/Claim contracts incrementally.

## Canonical Baseline
Architecture baseline: `d98db98ccdb67328b62ea2958994923c942552fb`.
Current remediation branch: `task/KMO-CONTROL-RISK-REMEDIATION-001`.
Current remediation plan-lock revision: `e86c20f6ab83b159e5e58c26863fe07a84936c26` plus this Master Brief revision once committed.
`task/KMO-CONTROL-001-control-foundation` must remain absent until the mandatory build-approval checkpoint.

## Scope
In scope before build:
- close the six Risk Council remediation items with inspectable evidence.
- run Pre-Build Council after remediation evidence passes.
- run Implementation Gate after Pre-Build PASS.

In scope after Owner Build Approval:
- C1 Control Foundation: Supabase Auth staff identity, RBAC, server/Edge privileged boundary, shell/navigation, audit/error surfaces, release evidence.
- C2 LINE Front Desk: signature verification, webhook idempotency, durable conversation ledger, AI/HUMAN takeover, staff reply, reply-token/push behavior, outbound state, recovery, audit, text+image preservation.
- C3 Customer 360 shell: LINE/customer context and Booking/Order/Claim adapter slots/interfaces in `NOT_CONNECTED` state until their gates pass.
- tests/security/release evidence required to reach adapter-ready.

Out of scope until Integration:
- Booking business logic or direct Booking table/RPC integration.
- Order/Claim business logic or integration.
- universal cross-domain customer PK.
- browser-held service role or LINE credential.
- direct browser privileged mutation.

## Locked Architecture / Security Invariants
- Control auth = Supabase Auth JWT verified server-side + dedicated server-managed RBAC.
- new Control endpoints never accept legacy `x-staff-key`; legacy passcode is transition-only and auditable.
- privileged mutations use server/Edge paths with explicit authorization and fail closed.
- durable ledger is conversation truth; `line_chat_sessions.history` is ephemeral AI/session memory.
- audit/ledger write failure cannot silently produce a successful privileged action.
- Realtime is delivery only; UI re-fetches/reconciles from durable truth.
- identity ambiguity fails closed/manual review through adapter/bridge semantics.
- Booking/Order/Claim stay `NOT_CONNECTED` / `NOT_AUTHORIZED` until their own gates.
- every Control-touching deploy/migration obeys `CONTROL-RELEASE-EVIDENCE-STANDARD.md`.

## Workflow Stack
- Current bounded remediation task keeps `WF-DEV-01 v1.1.0`.
- Hermes long-running execution uses `WF-RELAY-01 v1.2.0` with canonical `kanban-external-agent-dispatch v2.3.8`.
- Pre-Build and Implementation Gate use `WF-COUNCIL-01 v1.0.0` / canonical Council runtime.
- After Implementation Gate PASS + Owner Build Approval YES, `KMO-CONTROL-001` becomes a `COUNCIL-BUILD` execution under Relay.
- Control build release policy: `COUNCIL_RELEASE`, preserving final semantic role separation.

## Relay Runtime Readiness
Workflow/runtime parity is resolved and independently re-verified on 2026-09-13: `WF-RELAY-01 v1.2.0` targets canonical `kanban-external-agent-dispatch v2.3.8`, and the macOS runtime guard passes. This removes the prior governance-version HOLD. Every substantive stage still requires the v2.3.8 task-specific preflight and named-executor readiness checks.

## Long-Running Agent Policy
Hermes is orchestrator/gate/track/integration only and never patches production code.

Owner preference is AGY first-pass Builder for each material implementation stage when current readiness/capability admission supports that role. No silent substitution if AGY is unavailable or unsuitable under current routing evidence; HOLD or explicitly re-plan.

Every material build stage is followed by fresh Codex `INDEPENDENT-QA`. Codex sees neutral requirements and exact revision before Builder conclusions, then persists its first report before informed remediation context is released.

After Codex:
- SIMPLE defect → AGY repair once → fresh Codex QA.
- HARD defect → Claude consolidated remediation once → fresh Codex QA.
- CONTRACT INVALID / Decision Gap → STOP affected scope → targeted Council/Owner → update Source of Truth → resume.
- substantive defect remaining after Claude + fresh QA → STOP for Sol/Owner escalation; no endless loop.

## Phase A — Risk Remediation Closure
### C0.1 Relay Admission
Run full v2.3.8 task-specific preflight: runtime hash/home guard, exact source/revision, allowed paths, Owner authorization, and direct-executor executable/auth/invocation/provenance readiness.

### C0.2 AGY First Remediation Pass
AGY receives the six-item Risk remediation contract and may perform only authorized evidence/docs/automation changes plus explicitly authorized remediation actions. Production credential actions remain Owner-controlled.

Six closure items:
1. LINE token rotation evidence: new token works, old token revoked, no secret value persisted.
2. full production privilege sweep.
3. exact full migration-list parity.
4. named operational ownership for drift, webhook, audit failure, rotation evidence, passcode transition.
5. mandatory Release Evidence Standard persisted/enforced.
6. decision deadlines for passcode cutover and ledger retention.

If token rotation requires Owner console/credential action not delegated by standing authority, park once at `OWNER_TOKEN_ROTATION_ACTION_REQUIRED` with exact runbook and resume automatically after evidence is supplied.

### C0.3 Codex Independent Risk-Closure QA
Fresh Codex verifies all six items and exact evidence independently. No Builder conclusions before first report. PASS advances; defects follow the standard AGY-simple / Claude-hard routing.

### C0.4 Hermes Risk Closure Gate + Sol Final Verify
Hermes performs deterministic evidence completeness, git/status, parity-output, and policy-state checks, then returns the exact candidate to Sol for the single `WF-DEV-01` Final Verify required to close this remediation Task. This is a Commander checkpoint, not an Owner approval checkpoint.

If Sol Final Verify = PASS, mark `RISK_REMEDIATION = PASS` and Hermes automatically enters the already-authorized Pre-Build Council. No additional Owner checkpoint is required merely to start Pre-Build under this Master Brief.

## Phase B — Council Gates
### C0.5 Pre-Build Gate
Run targeted `WF-COUNCIL-01 v1.0.0` Decision Mode from the exact remediated baseline and locked invariants. Experts remain independent; Codex synthesizes according to Council runtime.

- PASS → automatically prepare/run Implementation Gate.
- REMEDIATE with bounded non-decision defects → persist a bounded WF-DEV remediation task/dispatch, execute one Relay remediation cycle, re-verify, then rerun Pre-Build.
- architecture/security/business Decision Gap → STOP for Owner/Sol.
- second substantive REMEDIATE after one bounded remediation cycle → STOP; do not loop gates indefinitely.

### C0.6 Implementation Gate
Run the planned implementation-readiness gate only after Pre-Build PASS. It must pin accepted baseline, task split, branch strategy, implementation-ready C1/C2/C3 contracts, acceptance criteria, test/release strategy, and absence of unresolved material decisions.

If Implementation Gate PASS, STOP at the mandatory checkpoint:
`OWNER_BUILD_APPROVAL_REQUIRED`

This is a hard Relay authority boundary. Do not create `task/KMO-CONTROL-001-control-foundation` and do not start C1 until Owner explicitly returns `Owner Build Approval = YES` against the exact gate result.

After Owner YES, Hermes resumes this Master Run without requiring a new planning conversation.

## Phase C — KMO-CONTROL-001 Build
On Owner Build Approval, create/persist `KMO-CONTROL-001` and its implementation branch from the exact accepted baseline specified by the Implementation Gate. Do not reuse the Risk Remediation branch as the feature branch.

### C1 — Control Foundation
Build the smallest complete foundation required by later LINE work:
- staff login/session via Supabase Auth.
- dedicated Control RBAC and server-side claim enforcement.
- server/Edge privileged-operation boundary.
- Control shell/navigation and controlled error surfaces.
- attributable audit boundary and failure behavior.
- release-evidence plumbing for Control-touching deploy/migration.

AGY first-pass when admissible → deterministic gate → fresh Codex Independent QA → bounded remediation routing → fresh QA. No Booking/Order/Claim reads or adapters beyond `NOT_CONNECTED` interfaces.

### C2 — LINE Front Desk Vertical Slice
Complete the end-to-end locked flow: verified LINE webhook signature; event dedup; inbound durable ledger; UI load/realtime delivery with DB reconciliation; AI response through existing safe path; deterministic HUMAN takeover blocking AI; staff reply; reply-token first with push fallback where contract allows; outbound SENT/FAILED persistence; AI re-enable with continuous context; material audit; text+image preservation; visible recovery/failure behavior.

Every external-send/DB partial-failure and retry/idempotency path must have explicit semantics and tests. The known `staff-reply` duplicate-send-on-retry hazard must be either reproduced and fixed or explicitly disproven on the exact implementation; it may not disappear from evidence by omission.

### C3 — Customer 360 / Adapter Shell
Show customer/channel/conversation context and typed adapter slots for Booking/Order/Claim. Before each domain gate, state is `NOT_CONNECTED`; no guessed direct queries. Cross-domain identity interface must preserve bridge/adapter semantics and fail closed on ambiguity.

This phase makes Control adapter-ready, not Domain-integrated.

## Phase D — Control Closure / Adapter-Ready Candidate
After C1/C2/C3 stage QA passes, Hermes performs repo-level deterministic integration verification. Because the post-gate Control build is a `COUNCIL-BUILD` with `release_policy=COUNCIL_RELEASE`, do **not** add Codex as a substantive final auditor that would later synthesize its own audit.

Instead:
1. Codex remains independent Stage QA for material C1/C2/C3 revisions.
2. Hermes performs deterministic integration verification.
3. Council Release Verification Mode performs final semantic conformance review.
4. PASS yields `READY_FOR_GPT_REVIEW`, never automatic Owner acceptance/done.
5. For this program, map that successful closure to `CONTROL_ADAPTER_READY_CANDIDATE = PASS` and park for convergence review.

## Adapter-Ready Acceptance Criteria
- C1 Auth/RBAC/server/audit foundation works on exact revision with fail-closed authorization.
- C2 LINE Front Desk thin vertical slice works end-to-end with durable ledger, AI/HUMAN state, send-state truth, idempotency/recovery, audit, and text+image handling.
- C3 Customer 360 shell exposes typed `NOT_CONNECTED` adapter slots without Domain table guessing.
- no service role/LINE credential is present in browser bundles/logs/evidence.
- required Control migrations/functions obey privilege/RLS/search-path and Release Evidence Standard.
- exact tests/lint/typecheck/build/security/runtime evidence exists.
- no Booking/Order/Claim implementation or integration occurred.
- exact branch/SHA and known limitations are persisted.

## Convergence Stop
If Domain is not ready, park at `CONTROL_ADAPTER_READY_CANDIDATE = PASS`.
If Domain already has `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS`, return one combined checkpoint to Sol/Owner:
`READY TO OPEN KMO-INTEGRATION-BOOKING-001`.

Do not automatically create or execute the Integration Task before that convergence review.

## Failure Cases / Security Checks
The execution/evidence must explicitly cover: invalid/expired staff JWT; missing/forged role; auth verification outage; audit or ledger write failure; duplicate/reordered LINE webhook delivery; LINE send succeeds but local write fails and vice versa; staff/AI and concurrent-staff races; Realtime loss/reconnect; migration/Git drift; SECURITY DEFINER exposure; secret leakage; webhook/provider outage; ambiguous identity; irreversible deletion/retention behavior.

No fail-open fallback is allowed for privileged authorization, auditability, identity ambiguity, or Domain isolation.

## Production Authority
The Master Run may perform read-only production verification automatically within tool/account authority. Any production mutation/deploy/secret rotation must be explicitly authorized by the owning Task/stage and follow rollback/evidence contracts. Token rotation is Owner-controlled unless separately delegated. Feature production release is not implied by Owner Build Approval.

## Owner / Sol Stop Points
Return only for:
- token/credential production action requiring Owner control.
- material Decision Gap.
- `OWNER_BUILD_APPROVAL_REQUIRED` after Implementation Gate PASS.
- production action lacking standing authority.
- critical unresolved defect after Claude/fresh QA.
- final dual-workstream convergence.

Sol Commander review may still occur where a pinned workflow requires Final Verify; this does not require Owner interruption.

Ordinary build PASS, Codex defects, bounded AGY/Claude remediation, and transition between C1/C2/C3 do not require Owner interruption.
