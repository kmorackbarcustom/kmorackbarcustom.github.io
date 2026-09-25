# D-3 EVIDENCE — Codex B1 DISPATCH PREPARATION (Owner ruling 2026-09-25)

Date: 2026-09-25 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Authority: Owner ruling 2026-09-25 — **D-3, Option A** (bounded to this run)
Status: **DISPATCHED** — awaiting the reviewer's independent verdict

## 1. What D-3 authorizes

```yaml
reviewer:                 agent-codex        # replaces agent-claude as the governing B1 reviewer
windows_route:            Session-1 only
required_provenance:      provenance_session=1
required_route_code:      CODEX_SESSION_1_SELECTED
provider:                 openai
model:                    gpt-6-luna
reasoning_effort:         medium
bounded_to:               KMO-DOMAIN-BOOKING-READINESS-001 D1A / B1 only
changes_canonical_policy: false
```

Persisted in the Run Manifest as **deviation D-3** (alongside D-1 engine, D-2 reviewer) and in the Task
checkpoint, **committed before dispatch** as the ruling requires: `fdff223`.

## 2. Why D-3 exists (the stop it resolves)

`CODEX_PIN_MISMATCH`: the authorized pin in the brief/registry (`gpt-5.6-luna`) is not the pin the
reviewed canonical runtime enforces (`gpt-6-luna`), and the canonical wrapper refuses the authorized
value outright while both models are individually live-capable. Full measurement and the four bounded
options are in `CODEX-READINESS-PROBE-2026-09-25.md`. D-3 selects Option A: use the runtime's enforced,
live-proven pin for this run rather than editing a protected runtime file from a product run.

## 3. Readiness evidence used for D-3 (re-measured pre-dispatch)

```text
executor_identity        = agent-codex
executor_registration    = codex-wrapper
execution_backend        = direct_external_process
transport_model          = none
version                  = codex-cli 0.156.1
executable               = D:\AI-Workspace\runtime\npm-global\npm\codex.cmd
wrapper                  = …/kanban-external-agent-dispatch/scripts/invoke-codex-worker.ps1
wrapper_sha256           = sha256:d106f2a78210c9384291e31dcad383bf34ea15b9c7dae4e48d813c0a614fe6a9
executable_health        = PASS
auth_readiness           = PASS (codex_login_status, text_authenticated)
invocation_probe         = PASS (codex_isolated_probe_session1, READY)
provenance_session       = 1
session_route_code       = CODEX_SESSION_1_SELECTED
```

These are the exact fields D-3 requires. A post-dispatch check must confirm the same fields appear on
the review invocation itself; a mismatch is a fail-closed STOP, not something to explain away.

## 4. Clean isolated review worktree (Owner requirement)

The ruling forbids reviewing from the then-current HEAD (`36e3cc6`), because LR-03 commits landed after
the frozen candidate. A dedicated detached worktree was created at the exact SHA:

```text
worktree:  D:\AI-Workspace\runtime\worktrees\kmo-b1-codex-580d165
command:   git worktree add --detach <path> 580d165e642e10ceb0ce26da473542cd1d65f504
HEAD:      580d165e642e10ceb0ce26da473542cd1d65f504   (verified)
status:    clean (no modifications)
```

Content verified to be the intended candidate and not a later revision:

```text
LR-03 SQL files present in this worktree   -> 0   (correct: the candidate predates LR-03)
holdHasTimeRemaining occurrences           -> 3   (LR-02B/C countdown present)
resolveBookingPageState occurrences        -> 2   (LR-02C truthful-state wiring present)
```

The worktree is a **worktree of the same repository object store**, so `git log`/`git diff` inside it
resolve the real committed history — the reviewer is inspecting genuine git objects, not a copy.

Test runnability inside the isolated worktree:

```text
node --no-warnings --test --experimental-test-isolation=none tests/*.test.ts
  -> tests 98 / pass 98 / fail 0
```

Confirmed to run **without** `node_modules` (the suite is a source-reading contract test), so no install
step was needed and none was performed. This matters because the rail's workspace scope guard rejects
the run if any file changes: `node_modules` was deliberately **not** created or copied.

## 5. Dispatch

```text
identity      agent-codex
context_mode  INDEPENDENT-QA
executable    canonical wrapper (invoke-codex-worker.ps1), Session-1 route
workspace     D:\AI-Workspace\runtime\worktrees\kmo-b1-codex-580d165
prompt        codex-b1-prompt.md
```

The prompt instructs the reviewer to reach its **own** verdict on `580d165`, to run the suite itself, to
test the evidence-doc claims (including per-work-unit lane states), and explicitly **not** to adopt the
earlier Claude reviewer's conclusions. It carries a hard write-prohibition so the scope guard is not
tripped, and requires a single final line `B1_BATCH_VERDICT: <…>`.

## 6. Prohibitions observed

```text
model_pins.py edited                      NO  (mtime unchanged, 2026-09-23)
Relay skill / runtime / config edited     NO  (no tracked change under data/skills)
Claude reviewer rail changed in this task NO
production apply / deploy / cutover       NO
Order / Claim / KMO Control               NO
LR-03 advancement                         NO  (ON HOLD until B1 PASS)
previous Claude verdicts used as B1       NO  (retained as evidence only)
```

## 7. Continue rule (from the ruling)

```text
B1 PASS / BATCH_APPROVED   -> resume LR-03 from the persisted HOLD state
B1 substantive finding     -> remediation / re-review contract
provenance mismatch vs D-3 -> STOP fail-closed, report Owner
```
