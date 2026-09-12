# TASK-KMO-CONTROL-RISK-REMEDIATION-001

Status: READY FOR BOUNDED REMEDIATION EXECUTION
Workflow ID: WF-DEV-01
Workflow Spec Version: 1.1.0
Workflow Registry: 1.2.0
Reason: bounded post-Council risk remediation; architecture/security direction is already locked
Repository: kmorackbarcustom/kmorackbarcustom.github.io
Workspace: /tmp/kmo-control-risk-remediation
Branch / Worktree: task/KMO-CONTROL-RISK-REMEDIATION-001
Base Commit: d98db98ccdb67328b62ea2958994923c942552fb
Accepted Baseline Revision: d98db98ccdb67328b62ea2958994923c942552fb
Owner: Free
Commander / Final Verify: Sol
Execution Coordinator: Hermes (Orchestrator/Clerk only)
Current Worker: NONE
Current Checkpoint: CP-01 TASK / BRIEF LOCK
Entry Conditions: PASS for bounded remediation only
Expected Stop: READY FOR SOL RISK REMEDIATION EVIDENCE REVIEW

## Objective

Close exactly the six Risk/Invariant Gate remediation requirements before Pre-Build.
This Task does not authorize KMO-CONTROL-001 implementation, Control feature work, Booking/Order/Claim integration, or Pre-Build entry.

## Source of Truth

1. Risk Council `FINAL-CODEX-SYNTHESIS.md` dated 2026-09-12.
2. Risk Council `COUNCIL-RUN-STATUS.md` and `HERMES-RETURN.md`.
3. Architecture baseline `d98db98ccdb67328b62ea2958994923c942552fb`.
4. `BRIEF-KMO-CONTROL-RISK-REMEDIATION-001.md` in this directory.
5. WSTERA `WF-DEV-01 v1.1.0` and Agent Dispatch Policy.
## Required Remediation

1. LINE channel access token rotation evidence: new token works, old token revoked, timestamps/evidence recorded without exposing secret values.
2. Production privilege sweep: SECURITY DEFINER + effective anon/authenticated exposure checked against locked invariants.
3. Full migration-list parity: exact set comparison production `schema_migrations` versus `supabase/migrations/*.sql` in both directions.
4. Operational ownership locked for drift, webhook liveness, audit failure, token rotation evidence, and passcode-transition review.
5. `CONTROL-RELEASE-EVIDENCE-STANDARD.md` becomes mandatory for every Control-touching deploy/migration.
6. Owner decision deadlines locked for shared-passcode cutover and conversation-ledger retention.

## Locked Ownership / Deadlines

- Final business authority: Free.
- Technical review / incident command / evidence acceptance: Sol.
- Hermes: execution coordination and evidence collection only; no self-authorization.
- Shared-passcode cutover decision deadline: before C1 exit / before C2 may start.
- Ledger-retention decision deadline: before any retention/deletion migration is authored, and no later than C2 production authorization.

## Hard Stops

- No `KMO-CONTROL-001` implementation.
- Do not create `task/KMO-CONTROL-001-control-foundation`.
- No Pre-Build entry until all six items are evidenced and Sol re-verifies them.
- No Booking/Order/Claim reads, writes, adapters, or integration.
- No feature deploy/migration under this Task.
- Production changes are limited to explicitly authorized remediation actions only; token rotation requires Owner-controlled credential action.
- No secret values in Task/Brief/evidence/logs.

## Next Action

Create a fresh Agent Dispatch Packet for the bounded remediation round. Do not reuse any Architecture/Risk Council dispatch.