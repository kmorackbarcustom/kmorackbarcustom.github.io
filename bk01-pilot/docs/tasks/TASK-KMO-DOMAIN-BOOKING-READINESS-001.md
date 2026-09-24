# TASK — KMO-DOMAIN-BOOKING-READINESS-001

Status: D0.5 CLOSED / D0.6 LOCKED / **D1A ACTIVATED — LR-00 PREFLIGHT IN PROGRESS (LONG_RUN)**
Owner: Free
Commander / Final Reviewer: Sol
Owning Workstream: DOMAIN OPERATIONS
Repository: `kmorackbarcustom/kmorackbarcustom.github.io`
Workspace: `D:/AI-Workspace/runtime/worktrees/kmo-d1a-longrun-20260924`
Branch: `task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924`
Accepted Base: `671d8f078c5dda3ba510c61bf721ac8ae13eb2f0`
D1A Base Ref: `refs/tags/kmo-bk01-d1a-longrun-prepared-20260924`
D1A Resolved Base SHA: `ac3c14746d87e2a6038d63e39715f30a8384b598`
Merge Target: `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`

## Workflow Stack (D1A re-pin — 2026-09-24)

- Workflow Registry: `1.6.0`
- Lifecycle / implementation contract: `WF-DEV-01 v1.4.0`.
- Execution Mode: `LONG_RUN`.
- Execution Engine for D1A: `hermes-native-swarm v0.1.1` (`swarmctl`, capability-class work units).
- Relay composition: `WF-RELAY-01 v1.3.0` for stage review routing and escalation only; Relay runtime on this host is `kanban-external-agent-dispatch v2.5.4`.
- Workflow authority inspected: `Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a`.
- Independent reviewer for this run: `agent-claude` (role `INDEPENDENT_BATCH_REVIEWER`), selected under the policy fallback condition with recorded evidence.
- Council is not required by default; invoke `WF-COUNCIL-01 v1.0.0` only for a material decision gap that can change architecture, security, data, business rules, or locked contracts.

### Owner authorization event (2026-09-24)

Owner forwarded `docs/BRIEF-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md` and additionally ruled:

1. **Execution engine = `hermes-native-swarm`** for D1A work units (instead of Relay-dispatched external CLI builders).
2. **Independent reviewer = `agent-claude`**, because `agent-codex` is not ready on this host at preflight time.

These two Owner rulings are the recorded deviations from the brief's default workflow pin. They are explicit and bounded to this run.

### Deviation record — Codex reviewer unavailability

`agent-codex` readiness at LR-00 returns `DIRECT_EXECUTOR_NOT_READY:agent-codex:sandbox_execution_failed`.
Raw measured cause: `codex sandbox --permission-profile :read-only … powershell` exits `3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED)`.
This is the known session-0 restricted-token child-launch condition, not a Codex model-pin fault.
Model access itself is healthy: `codex exec --sandbox read-only -m gpt-6-luna` returns exit 0 with an exact `READY`.
Therefore the fallback condition in `policies/INDEPENDENT-REVIEW-POLICY.md` (`EXECUTOR_NOT_READY`) is met with evidence.

## Objective
Move KMO Booking from the accepted runtime-context closure baseline to an evidence-backed `BOOKING_READY_FOR_CONTROL` candidate while preserving the real-shop separation between customer intake scheduling and long-running workshop work.

Do not touch KMO Control implementation, Order, Claim, or canonical BK01.

## Current Authorization
- Booking domain work: authorized within this task, including the KMO-specific intake-calendar/work-lifecycle separation locked on 2026-09-23.
- KMO daily intake capacity may be made configurable and server-authoritative.
- A Booking may consume one or more intake units on `appointment_date`.
- Long-running work/pickup duration must not automatically block later public Booking dates.
- Source/test/SQL/document implementation inside the locked D1A scope: authorized.
- Production schema apply, deploy, cutover, destructive action: **NOT authorized**.
- Order: `NOT_AUTHORIZED_YET`.
- Claim: `NOT_AUTHORIZED_YET`.
- KMO Control implementation: prohibited.
- Integration task: prohibited until D1 and Control adapter-ready conditions are both satisfied.
- Canonical BK01: frozen under Owner Hold; no mutation from this task.

## Source of Truth Order
1. This Task checkpoint.
2. `bk01-pilot/docs/PLAN-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md`.
3. `bk01-pilot/docs/RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md` (LOCKED).
4. `bk01-pilot/docs/REPORT-SOL-KMO-BK01-SEED-ADOPTION-INDEPENDENT-VERIFICATION-2026-09-24.md`.
5. `bk01-pilot/docs/REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`.
6. `bk01-pilot/docs/REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`.
7. `bk01-pilot/docs/BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md`.
8. `bk01-pilot/docs/MASTER-BRIEF-KMO-DOMAIN-TO-D1-2026-09-12.md`.
9. Locked `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, and `DOCUMENTATION_INDEX.md`.
10. Exact source/migrations/tests at the pinned revision under review.
11. Reference pack `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/**` — READ ONLY.
12. Root legacy `booking.html` / `bookingdashboard.html` are behavioral evidence only; they do not override current security/data contracts and must not be copied wholesale.
13. Older review/status documents are evidence only and must not override newer source/runtime facts.

## Checkpoints
| Checkpoint | Initial State | Required Result |
|---|---|---|
| D0 Relay admission / source freeze | PASS | fresh preflight PASS (LR-00) |
| D0.5 BK01 R4 upstream reconciliation | PASS | reduced evidence-backed D1A worklist locked |
| D0.6 KMO legacy Booking extraction | PASS / LOCKED | appointment-date intake and separate work lifecycle adopted as KMO D1A authority |
| D1A Booking implementation/readiness pass | IN PROGRESS (LR-00) | coherent Booking candidate revision from updated KMO-first worklist |
| D1B Independent batch review | PENDING | PASS or bounded defect contract |
| D1C Remediation loop | PENDING | defects closed under routing policy |
| D1D Runtime/release evidence | PENDING | exact deployment/runtime evidence where authorized |
| D1E Control-facing contract lock | PENDING | stable read/action/identity bridge contract |
| D1F Final D1 audit | PENDING | `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` |
| D1G Convergence wait | PENDING | wait for Control adapter-ready candidate |

## Current Worker / Checkpoint
Current Worker: `swarm-inspector` / `swarm-builder` / `swarm-tester` / `swarm-db` via `hermes-native-swarm` (per capability class); Hermes = orchestrator/state holder only.
Current Checkpoint: `LR-00 PREFLIGHT` — source freeze verified, branch/worktree created at `ac3c147`.
Latest Dispatch/Relay stage pointer: none released yet (LR-01 not materialized).
Expected Stop: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` or an exact declared blocked/Owner-decision checkpoint.

Next Allowed Action: complete LR-00 by materializing the swarm dispatch package for LR-01 only after the LR-00 gate passes.

## Hard Stops
No Order/Claim; no KMO Control implementation; no generic cross-domain capacity engine; no cross-workstream schema redesign; no universal customer PK; no secret disclosure; no production mutation/deploy unless a stage has explicit authority; no automatic Integration Task creation; no canonical BK01 mutation.
