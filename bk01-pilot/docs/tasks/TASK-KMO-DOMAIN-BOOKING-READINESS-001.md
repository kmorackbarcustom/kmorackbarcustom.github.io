# TASK — KMO-DOMAIN-BOOKING-READINESS-001

Status: D0.5 CLOSED / READY FOR FRESH D1A RELAY PREFLIGHT
Owner: Free
Commander / Final Reviewer: Sol
Owning Workstream: DOMAIN OPERATIONS
Repository: `kmorackbarcustom/kmorackbarcustom.github.io`
Workspace: `/tmp/kmo-domain-booking-readiness`
Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`
Accepted Base: `671d8f078c5dda3ba510c61bf721ac8ae13eb2f0`

## Workflow Stack
- Lifecycle / implementation contract: `WF-DEV-01 v1.1.0`.
- Long-running executor: `WF-RELAY-01 v1.2.0`.
- Canonical Relay runtime currently observed on Mac: `kanban-external-agent-dispatch v2.3.8`.
- Workflow/runtime parity is verified: `WF-RELAY-01 v1.2.0` points to canonical `kanban-external-agent-dispatch v2.3.8`. Fresh task-specific Relay preflight is still mandatory before substantive dispatch.
- Council is not required by default; invoke `WF-COUNCIL-01 v1.0.0` only for a material decision gap that can change architecture, security, data, business rules, or locked contracts.

## Objective
Move KMO Booking from the accepted Mac runtime-context closure baseline to an evidence-backed `BOOKING_READY_FOR_CONTROL` candidate without touching KMO Control implementation, Order, Claim, or cross-workstream integration.

## Current Authorization
- Booking domain work: authorized within this task and Master Brief.
- Order: `NOT_AUTHORIZED_YET`.
- Claim: `NOT_AUTHORIZED_YET`.
- KMO Control implementation: prohibited.
- Integration task: prohibited until D1 and Control adapter-ready conditions are both satisfied.

## Source of Truth Order
1. This Task checkpoint.
2. `bk01-pilot/docs/REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`.
3. `bk01-pilot/docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`.
4. `bk01-pilot/docs/MASTER-BRIEF-KMO-DOMAIN-TO-D1-2026-09-12.md`.
5. `bk01-pilot/docs/relay/RELAY-PLAN-KMO-DOMAIN-TO-D1-2026-09-12.md`.
6. Locked `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, and `DOCUMENTATION_INDEX.md`.
7. Exact source/migrations/tests at the pinned revision under review.
8. Closure report and fresh handoff from `KMO-MAC-RUNTIME-CONTEXT-001` as baseline evidence.
9. Older review/status documents are evidence only and must not override newer source/runtime facts.

## Checkpoints
| Checkpoint | Initial State | Required Result |
|---|---|---|
| D0 Relay admission / source freeze | RE-PREFLIGHT REQUIRED | fresh Relay preflight PASS on current rebuilt runtime |
| D0.5 BK01 R4 upstream reconciliation | PASS | reduced evidence-backed D1A worklist locked |
| D1A Booking implementation/readiness pass | READY AFTER PREFLIGHT | coherent Booking candidate revision from reduced worklist |
| D1B Independent Codex QA | PENDING | PASS or bounded defect contract |
| D1C Remediation loop | PENDING | defects closed under routing policy |
| D1D Runtime/release evidence | PENDING | exact deployment/runtime evidence where authorized |
| D1E Control-facing contract lock | PENDING | stable read/action/identity bridge contract |
| D1F Final D1 audit | PENDING | `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` |
| D1G Convergence wait | PENDING | wait for Control adapter-ready candidate |

## Current Worker / Checkpoint
Current Worker: NONE — D0.5 completed while Hermes runtime is being refreshed.
Current Checkpoint: D0.5 PASS; D1A is staged but not dispatched.
Expected Stop: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` or exact blocked/Owner-decision checkpoint.
Next Allowed Action: run a fresh task-specific Relay/Hermes preflight against the current runtime and exact task revision. If PASS, dispatch D1A using only `BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`; do not use the unreduced historical worklist.

## Hard Stops
No Order/Claim; no KMO Control implementation; no cross-workstream schema redesign; no universal customer PK; no secret disclosure; no production mutation/deploy unless a stage has explicit authority; no automatic Integration Task creation.
