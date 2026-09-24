# B1 — INDEPENDENT BATCH REVIEW RESULT

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Review Batch: `B1` — stages `LR-01` + `LR-02` + `LR-02C`
Batch base: `09f6dde73801b4ef2932134da9ccef2e5783c370`

## Two verdicts, two revisions

| Pass | Revision | Verdict |
|---|---|---|
| B1 first review (stages LR-01 + LR-02 + LR-02C) | `234603d22be1954e63ddf17d606fca0b27587a70` | `APPROVED_WITH_FINDINGS` |
| B1 bounded re-review (after the F1/F4 remediation) | `8b6732540d6e952f2d95192b8ea1fb3ef73952a3` | `APPROVED_WITH_FINDINGS` — F1 and F4 confirmed closed, **no new blocking finding** |

The re-review is the verdict that covers the current reviewed line of work: it examined the
remediation diff (`git diff 234603d..8b67325 -- apps tests`) explicitly, confirmed the dead
identifier is gone, confirmed the dedicated `BOOKING_DISABLED` screen survived, confirmed the
test change is a single assertion line with the test-block count unchanged at 12 and no
weakened assertion, and reproduced the evidence numbers itself (`npm test` 98/98, `npm run
lint` 0 errors). It also re-examined the two transparency corrections made during this
continuation and judged both to be correct disclosure rather than concealment.

## Reviewer provenance — first review (`234603d`)

```text
executor_identity        = agent-claude
declared_agent_identity  = agent-claude
executor_registration    = claude-code-cli
execution_backend        = direct_external_process
transport_model          = none
executable               = …/@anthropic-ai/claude-code/bin/claude.exe
version                  = 2.1.269 (Claude Code)
executable_health        = PASS
auth_readiness           = PASS (claude_auth_status, json_logged_in_true)
invocation_probe         = PASS (claude_plan_probe -> READY)
context_mode             = INDEPENDENT-QA
exit_code                = 0
prompt_sha256            = sha256:7546e94aebf6026f0738f456f675b3107b52ac38c77d82673cb0635d21282b0a
stdout_sha256            = sha256:e15e64665b6a737c8752e0c7bcd788c521d0b906eb63604420ae30fb1cd0fc87
stdout_bytes             = 12870
stderr_sha256            = sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (empty)
```

## Reviewer provenance — bounded re-review (`8b67325`)

```text
executor_identity        = agent-claude
declared_agent_identity  = agent-claude
execution_backend        = direct_external_process
transport_model          = none
version                  = 2.1.269 (Claude Code)
EXECUTOR_READY           = PASS
context_mode             = INDEPENDENT-QA
exit_code                = 0
prompt_sha256            = sha256:5be763e1b79bab24c67a2449e23280ef7e98df86d22a8a605bc43a60886c95b7
stdout_sha256            = sha256:337224344bf9cd60be157144e2114ab44fa854fdf141f3ddb69521cf5d07cc51
```

Both reviewers are `agent-claude` — the Owner-ruled reviewer for this run (deviation D-2).
The reviewer is not the author of the reviewed diff. In both passes it reported reading the
source itself, running `git log` / `git diff` / `git status`, and running `npm test` and
`npm run lint` in its own session, and both times it independently reproduced the evidence
docs' headline numbers rather than accepting them.

**No reviewer substitution was made.** Codex became available during this run, but re-routing
to it would have been reviewer shopping (`no_reviewer_shopping: true`) against an explicit
Owner ruling.

## How the rail blocker was cleared (no skill was patched)

A prior dispatch returned a plan instead of a review. Root cause was re-verified by the
controller directly in the protected Relay skill
(`…/kanban-external-agent-dispatch/scripts/direct_external_executors.py`, ~lines 1243–1252):
only an explicit `BUILD` context mode receives `--permission-mode bypassPermissions`; every
other mode — including `INDEPENDENT-QA` — is pinned to `--permission-mode plan`, with no env
override, and `allowed_write_paths` is enforced only on the opencode branch.

Because a read-only reviewer genuinely cannot write a report file, the batch was re-issued with
an output contract that makes the reviewer's **message text itself** the deliverable: an explicit
instruction that the reply must be the complete review, must not be a plan or a question, and
must end with a single machine-readable verdict line.

Result: exit 0, a full review, and a real verdict — twice.

Two further rail lessons were learned the hard way while obtaining the re-review, and are part
of this record:

1. The rail's workspace scope guard rejects the run if **any** file changes during the reviewer
   session, including gitignored build output. An earlier re-review attempt was discarded
   because the reviewer ran a production build, which regenerated
   `bk01-pilot/apps/booking-consumer/.next/**`. Fixed by stating a hard write prohibition in the
   reviewer contract and telling the reviewer the build is already controller-verified
   (`npm run build` → PASS), so it is not an unverified area.
2. The controller's own `npm run build` had left the same generated tree in the workspace and
   tripped the guard before the reviewer even started. Generated build output was removed;
   nothing tracked or evidential was deleted (`git ls-files | grep -c '.next/'` = 0, worktree
   clean before and after).

**Not done, deliberately:** the protected Relay skill was not edited; the reviewer identity was
not substituted; and the weaker substitute ("Hermes runs the suite and the reviewer reads the
output") was refused because it would not be an independent-QA result.

## Stage assessment by the reviewers

| Stage | Assessment |
|---|---|
| `LR-01` pure helpers | PASS (both passes). `countOpenWeeklyDays` really reads `local_service.shop_weekly_schedules` via `getShopAvailability(shopId).weeklySchedule` — not a staff-only model. `resolvePaymentInstruction` fails closed on the full tuple with no literal fallback. `remainingHoldSeconds` returns `null` for unusable input and `0` for a genuinely elapsed hold, kept properly distinct. LR-01 unit tests import the real functions and test behaviour, not source text. |
| `LR-02` consumer wiring | F-2 closure confirmed: no `?? 100`, no literal `900` countdown source, `promptpayName` only from `shop?.promptpay_name`. The first reviewer specifically checked that the page's separate use of `shop?.name` is a header title, not payment identity, and found no section C violation. |
| `LR-02C` truthful states | The page calls `resolveBookingPageState` and `countOpenWeeklyDays`, all seven non-OK states have dedicated screens in correct precedence, `SHOP_NOT_FOUND` is genuinely distinct from `LOAD_ERROR`, and both new i18n keys exist non-empty in `th.json` and `en.json`. |

## Findings

| # | Severity | Status | Detail |
|---|---|---|---|
| F1 | MEDIUM | **CLOSED** (`580d165`) | Dead `isBookingBlocked` branch removed; `grep -c isBookingBlocked` = 0 in both files; the dedicated full-page `BOOKING_DISABLED` screen retained and now the only consumer of `blocked.title` / `blocked.description` / `callShop`. |
| F2 | LOW | CARRIED (non-blocking) | `everyServicePaymentBlocked` reuses the globally-computed `paymentMethodAvailable` inside a per-service `.every()`. Both reviewers judge the page-state result correct for all realistic inputs; recorded as an architectural weakness, not a reachable bug. |
| F3 | LOW | CARRIED (by design) | The LR-02/LR-02C tests are regex-on-source assertions, not render/behaviour tests. 98/98 is real but is not runtime proof; logic flaws like F1/F2 cannot be caught by them. `LR-06` is the stage that owns real browser/mobile evidence. |
| F4 | LOW | **CLOSED** (`580d165`) | The `contactFallback` comment now matches the code: `SHOP_NOT_FOUND` deliberately omits it and `BOOKING_DISABLED` has its own inline call button. |
| F5 | LOW | CARRIED (non-blocking) | Brief section B names `NO_SLOT_FOR_DATE`; it remains the pre-existing date-scoped inline step-2 banner (`setupState.noSlots`) rather than a shop-wide page state. Behaviour is arguably correct (it is date-scoped, not shop-wide readiness), but the literal brief gap is not closed. |

The re-review found **no new blocking finding**, and confirmed F2/F3/F5 unchanged in status
because this remediation touched neither `src/lib` nor the message files.

## Reviewer's check of the evidence docs (the point the controller asked it to test)

Both passes specifically examined the `LR02B-WU02-EXPIRED-STATE-CORRECTION` ledger row. Both
concluded that the correction is transparent — the doc now states the raw lane record is
`SWARM_WORK_UNIT_FAIL` / `WORKER_REPORTED_FAIL` (envelope exit 2) rather than the PASS the
original table claimed — and the re-review additionally judged the `LR02D-WU01` BLOCKED attempt
record to be a correct disclosure rather than concealment of a failure. Verdict on the docs:
**no claim stronger than the code supports, and no FAIL converted into a PASS by explanation.**

It also noted that the Task checkpoint honestly states B1 was approved at `234603d` while the
tip had moved on — which is exactly the situation re-review exists to resolve.

## Reviewer's unverified areas (as declared)

- `npm run build` — deliberately not run by either reviewer (see rail lesson 1). The controller
  ran it separately: PASS.
- Real browser/mobile runtime behaviour — no render environment; deferred to `LR-06` by design.
- The section C item "regression-test no-QR/no-copy/no-download when payment authority is
  incomplete" exists as logic-level fail-closed tests (`resolvePaymentInstruction` /
  `resolveStaticQrInstruction`) but not as a rendered-DOM behavioural test. The re-review
  correctly classifies this as pre-existing from LR-02/LR-02A (already approved in pass 1,
  covered by F3), not something the remediation changed, so not a new finding.

## Controller follow-up

Findings F1 and F4 were turned into a bounded remediation unit (`LR02D`) rather than hand-patched
by Hermes. F2, F3 and F5 are carried with dispositions, not dropped: F3's limitation is inherent
to the stage and is answered by LR-06; F2 and F5 are logged for the LR-03+ record and are not
blocking for B1.

The first `LR02D` packet was **BLOCKED by the worker, correctly** — the controller's own
`consumer-truthful-states.test.ts` asserted the very dead identifier F1 removes, so
"full suite passes unmodified" was unsatisfiable. That was a controller spec defect, not a worker
defect; it was corrected by re-issuing the unit with that one test file in scope for one line of
surgery, with checks added to prove no assertion was weakened and no test block was removed. A
declared check in that re-issued packet was itself found defective during the pre-dispatch
baseline run (the test file stores regex-escaped literals, so a plain grep never matched; the
original form would have produced a false FAIL) and was fixed before dispatch.
