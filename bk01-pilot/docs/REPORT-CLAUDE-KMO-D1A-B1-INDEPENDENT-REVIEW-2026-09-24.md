# B1 — INDEPENDENT BATCH REVIEW RESULT

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Review Batch: `B1` — stages `LR-01` + `LR-02` + `LR-02C`
Revision under review: `234603d22be1954e63ddf17d606fca0b27587a70`
Batch base: `09f6dde73801b4ef2932134da9ccef2e5783c370`

## Verdict

```text
B1_BATCH_VERDICT: APPROVED_WITH_FINDINGS
```

## Reviewer provenance (persisted, not inferred)

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

The reviewer is not the author of the reviewed diff. It reported reading the source itself and
running `git log` / `git diff` / `git status`, `npm test` and `npm run lint` in its own session,
and it independently reproduced the evidence docs' headline numbers (98/98 tests, lint 0 errors).

## How the earlier rail blocker was cleared (no skill was patched)

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

Result: exit 0, a full review, and a real verdict.

**Not done, deliberately:** the protected Relay skill was not edited; the reviewer identity was not
substituted; the Owner-ruled reviewer (`agent-claude`, deviation D-2) was kept rather than
re-routing to Codex, because `no_reviewer_shopping: true`; and the weaker substitute
("Hermes runs the suite and the reviewer reads the output") was refused because it would not be
an independent-QA result.

## Stage assessment by the reviewer

| Stage | Reviewer's assessment |
|---|---|
| `LR-01` pure helpers | PASS. `countOpenWeeklyDays` really reads `local_service.shop_weekly_schedules` via `getShopAvailability(shopId).weeklySchedule` — not a staff-only model. `resolvePaymentInstruction` fails closed with no literal fallback. `remainingHoldSeconds` returns `null` for unusable input and `0` for a genuinely elapsed hold. LR-01 unit tests import the real functions and test behaviour, not source text. |
| `LR-02` consumer wiring | Confirmed the F-2 closure itself: no `?? 100`, no `promptpay_name \|\| shop?.name`, no `fallbackShopName`, no `useState<number>(900)` / `setTimeLeft(900)`. |
| `LR-02C` truthful states | The page calls `resolveBookingPageState` and `countOpenWeeklyDays`, every non-OK state has its own screen in correct precedence, `SHOP_NOT_FOUND` and `LOAD_ERROR` are separate branches, both new i18n keys exist in both message files. |

## Findings

| # | Severity | Finding |
|---|---|---|
| F1 | MEDIUM (non-blocking) | Dead branch left from before LR-02C: `isBookingBlocked` (page ~165) is always `false` by the time `<main>` is reached (~582), because `pageState === 'BOOKING_DISABLED'` already returned a full-page screen (~477). Behaviour is correct; the branch is unreachable and should be removed. |
| F2 | LOW | `everyServicePaymentBlocked` (~193-198) reuses the globally-computed `paymentMethodAvailable` inside a per-service `.every()`. The `.every()` invariant keeps the page-state result correct in all realistic cases; noted as an architectural weakness, not a reachable bug. |
| F3 | LOW | The LR-02/LR-02C tests are regex-on-source assertions, not behavioural/render tests. The 98/98 figure is real but is **not runtime behaviour proof**; logic flaws like F1/F2 cannot be caught by them. The reviewer classifies this as a limitation of this evidence set, with LR-06 as the stage that owns real browser/e2e evidence. |
| F4 | LOW | The comment above `contactFallback` (~426-427) claims it is used "for every non-OK state", but `SHOP_NOT_FOUND` deliberately omits it and `BOOKING_DISABLED` uses its own inline call button. Behaviour correct; comment overstated. |
| F5 | LOW | Brief section B names `NO_SLOT_FOR_DATE` explicitly, but `BookingPageState` does not model it; it remains the pre-existing inline step-2 banner (`setupState.noSlots`). Not a regression of this batch and arguably correct (it is date-scoped, not shop-wide), but the literal brief gap is not closed. |

## Reviewer's check of the evidence docs (the point the controller asked it to test)

The reviewer specifically examined the `LR02B-WU02-EXPIRED-STATE-CORRECTION` ledger row and
reported that the correction is now transparent: the doc states the raw lane record is
`SWARM_WORK_UNIT_FAIL` / `WORKER_REPORTED_FAIL` (envelope exit 2) rather than the PASS the
original table claimed, and `LR-02C-EVIDENCE-2026-09-24.md` backs its artifacts with sha256 blob
identity plus two non-vacuity controls. Its conclusion: **no remaining FAIL is converted into a
PASS by explanation** in the ledger at the reviewed SHA.

## Reviewer's unverified areas (as it declared them)

- `npm --workspace apps/booking-consumer run build` — not run by the reviewer; it relied on the
  evidence doc's PASS claim. The controller ran the build separately and it PASSed.
- Real browser/mobile runtime behaviour — no render environment; by design deferred to `LR-06`.
- `LR-03` and later — out of this batch's scope.

## Controller follow-up

Findings F1 and F4 were turned into a bounded remediation unit (`LR02D`) rather than hand-patched
by Hermes. F2, F3 and F5 are recorded as carried findings: F3's limitation is inherent to the
stage and is answered by LR-06; F2 and F5 are logged for the LR-03+ record and are not blocking
for B1.

The first `LR02D` packet was **BLOCKED by the worker, correctly** — the controller's own
`consumer-truthful-states.test.ts` asserted the very dead identifier F1 removes, so
"full suite passes unmodified" was unsatisfiable. That was a controller spec defect, not a worker
defect; it was corrected by re-issuing the unit with that one test file in scope for one line of
surgery, with checks added to prove no assertion was weakened and no test block was removed.
