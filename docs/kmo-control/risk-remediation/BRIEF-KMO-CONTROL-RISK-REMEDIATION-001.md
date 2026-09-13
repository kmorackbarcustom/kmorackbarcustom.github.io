# BRIEF-KMO-CONTROL-RISK-REMEDIATION-001

Date: 2026-09-12
Task ID: KMO-CONTROL-RISK-REMEDIATION-001
Workflow: WF-DEV-01 v1.1.0
Registry: 1.2.0
Owner: Free
Commander / Reviewer: Sol

## Problem

Risk/Invariant Council returned `RISK_GATE = REMEDIATE — STOP` with six bounded closure requirements. Architecture remains valid; progression is blocked only until evidence closes those six requirements.

## User / Outcome

KMO Owner needs a verifiable security/operations baseline that can safely enter Pre-Build without reopening architecture or silently carrying known credential, privilege, migration, release, or ownership debt.

## Scope

In scope only:
- LINE token rotation evidence.
- production privilege sweep evidence.
- full migration-list parity evidence.
- operational ownership assignment.
- mandatory Control Release Evidence Standard.
- decision deadlines for passcode cutover and ledger retention.

Out of scope:
- Control product implementation.
- Booking/Order/Claim integration.
- ledger schema implementation.
- auth/RBAC implementation.
- Realtime implementation.
- staff-reply feature remediation except as evidence/known carry-forward.
## Architecture / Data Boundary

- Canonical baseline: `d98db98ccdb67328b62ea2958994923c942552fb`.
- `KMO-CONTROL-001` remains unstarted.
- Control browser must never receive service-role or LINE credentials.
- Privileged mutations remain server/Edge + explicit authorization only.
- Durable ledger remains future source of truth; Realtime remains delivery only.
- Identity ambiguity fails closed through bridge/adapter semantics.
- Booking/Order/Claim remain NOT_CONNECTED / NOT_AUTHORIZED.

## Failure Cases

- New LINE token fails push/reply before old token revocation.
- Old token is not demonstrably revoked.
- Privilege sweep misses SQL-Editor-created or non-migration surfaces.
- Production/Git migration sets differ in either direction.
- Operational responsibility remains generic rather than named.
- Release Evidence Standard remains advisory/proposed.
- Passcode or retention decisions remain open-ended.

## Security / Evidence Requirements

- Never print or persist credential values.
- Token evidence records timestamps, target identifiers, smoke result, and revocation confirmation only.
- Privilege audit is read-only and records effective grants/exposure.
- Migration parity uses exact version/file sets, not spot checks.
- Any mismatch = HOLD; do not invent a repair in the same verification step.
- Evidence must identify exact revision/runtime context and check result.

## Acceptance Criteria

All six remediation items have inspectable evidence and no unresolved material mismatch. `CONTROL-RELEASE-EVIDENCE-STANDARD.md` is canonical mandatory policy, ownership/deadlines are persisted, Git/worktree state is clean, and Sol returns `RISK_REMEDIATION = PASS — READY FOR OWNER PRE-BUILD DECISION`.

## Stop / Continuation

This bounded Risk Task stops at Sol Final Verify. It must not create the Control feature branch or begin Control implementation.

If Sol returns `RISK_REMEDIATION = PASS`, this Task closes. Under the separately persisted Owner-approved `MASTER-BRIEF-KMO-CONTROL-TO-ADAPTER-READY-2026-09-12.md`, Hermes may then invoke the already-planned Pre-Build Council without another Owner checkpoint. Pre-Build PASS still does not authorize C1; Implementation Gate PASS + explicit `Owner Build Approval = YES` remain mandatory before `KMO-CONTROL-001`.