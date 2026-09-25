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
Current Worker: `swarm-builder` via `hermes-native-swarm` (capability `implementation`); Hermes = orchestrator/state holder only.
Current Checkpoint: `LR-02D COMPLETE` — LR-01 helpers + payment authority + hold expiry + truthful states all wired and committed, and B1's F1/F4 findings remediated (`f74ac29`, `c95a3bf`, `f135edb`, `ce163ae`, `e1ff830`, `07558fe`, `234603d`, `580d165`, `4b7efb9`; evidence `e8fdef0`, `d01725e`, `LR-02C-EVIDENCE-2026-09-24.md`, `LR-02D-EVIDENCE-2026-09-24.md`, `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md`).
Latest Dispatch/Relay stage pointer: `LR01-WU01-RQ` / `LR01-WU02` / `LR01-WU03` / `LR02A-WU01B` / `LR02B-WU01` / `LR02B-WU02` / `LR02C-WU01` / `LR02D-WU01`(BLOCKED, correct) / `LR02D-WU02` — all lane dispositions recorded in the attempt ledgers.
Expected Stop: `BOOKING_READY_FOR_CONTROL_CANDIDATE = PASS` or an exact declared blocked/Owner-decision checkpoint.

Next Allowed Action: B1 = **`APPROVED_WITH_FINDINGS`**, twice, from `agent-claude` — first at `234603d` (LR-01 + LR-02 + LR-02C), then a bounded re-review at `8b67325` that confirmed F1/F4 closed with **no new blocking finding**. The re-review verdict covers the current tip, so `LR-03` (KMO DB contract, Review Batch B2 critical) is now unblocked. Both verdicts and full reviewer provenance are persisted in `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md`. Carried non-blocking findings F2/F3/F5 remain as recorded: F3 (regex-on-source tests are not runtime proof) is LR-06's responsibility, F2/F5 are logged for LR-03+.

B1's actionable findings F1 (dead `isBookingBlocked` branch) and F4 (overclaiming comment) are CLOSED at `580d165`. Carried non-blocking: F2 (`everyServicePaymentBlocked` reuses a global `paymentMethodAvailable` inside a per-service check — not reachable as a bug), F3 (regex-on-source tests are not runtime proof; `LR-06` owns browser/mobile evidence), F5 (brief section B names `NO_SLOT_FOR_DATE`; it stays the date-scoped inline step-2 banner rather than a shop-wide page state).

Corrections recorded during the continuation (2026-09-24):
- `LR-02B-WU02` was listed in `LR-02-EVIDENCE-2026-09-24.md` as a lane PASS; the raw lane record is `SWARM_WORK_UNIT_FAIL` (`WORKER_REPORTED_FAIL`). Corrected in place; its artifacts were independently re-verified before being relied on.
- `LR-02` was marked `COMPLETE` at `d01725e` while its own required outcome (brief section B truthful states) was not yet met — `resolveBookingPageState` / `countOpenWeeklyDays` had zero app usage. Closed by LR-02C at `07558fe`.
- `LR02D-WU01` was BLOCKED by the worker against a **controller spec defect**: the packet forbade test edits while F1 required the dead identifier to reach zero occurrences, and the controller's own test pinned it. Re-issued as R2 with the one test file in scope; recorded in `LR-02D-EVIDENCE-2026-09-24.md`.
- One declared check in the R2 packet was found defective in the pre-dispatch baseline run (the test file stores regex-escaped literals, so a plain grep never matched) and was fixed before dispatch; the original form would have produced a false FAIL.

Note: `F-2` is closed at product level — `?? 100`, the merchant-name fallback and the independent `900` countdown are all gone from `apps/booking-consumer/src/app/book/[slug]/page.tsx`, and the three invented-data defects are covered by focused tests.

## Stage progress
| Stage | State | Evidence |
|---|---|---|
| LR-00 preflight / activation | PASS | `LR-00-PREFLIGHT-EVIDENCE-2026-09-24.md` · commits `020e506`, `09f6dde` |
| LR-01 pure helpers | COMPLETE | `LR-01-EVIDENCE-2026-09-24.md` · commits `f74ac29`, `c95a3bf`, `f135edb`, `e8fdef0` |
| LR-02 consumer truth/payment | COMPLETE | `LR-02-EVIDENCE-2026-09-24.md` · commits `ce163ae`, `e1ff830` |
| LR-02C truthful-state wiring | COMPLETE | `LR-02C-EVIDENCE-2026-09-24.md` · commit `07558fe` |
| B1 independent review | `APPROVED_WITH_FINDINGS` @ `234603d` (agent-claude) — **SUPERSEDED as governing review by Owner ruling 2026-09-25** | `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md` · `B1-CANDIDATE-RECONCILIATION-2026-09-25.md` |
| B1 (Codex re-review per Owner ruling) | `STOP_CODEX_MODEL_PROVENANCE_MISMATCH` — waiting ruling | `CODEX-READINESS-PROBE-2026-09-25.md` · candidate `580d165` |
| LR-02D B1 findings F1/F4 | COMPLETE @ `580d165` | `LR-02D-EVIDENCE-2026-09-24.md` · lane `LR02D-WU02` 10/10 |
| B1 re-review of current tip | `APPROVED_WITH_FINDINGS` @ `8b67325` | F1/F4 confirmed closed, no new blocking finding · `REPORT-CLAUDE-KMO-D1A-B1-INDEPENDENT-REVIEW-2026-09-24.md` |
| LR-03 intake/work schema | **ON HOLD** (Owner ruling 2026-09-25) — `REMEDIATE` pending | `LR-03-EVIDENCE-2026-09-24.md`, `QUALIFICATION-LR03-WU01-2026-09-25.md` |

## Hard Stops
No Order/Claim; no KMO Control implementation; no generic cross-domain capacity engine; no cross-workstream schema redesign; no universal customer PK; no secret disclosure; no production mutation/deploy unless a stage has explicit authority; no automatic Integration Task creation; no canonical BK01 mutation.
