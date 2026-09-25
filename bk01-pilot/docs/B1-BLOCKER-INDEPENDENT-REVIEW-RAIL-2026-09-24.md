# B1 BLOCKER — independent reviewer rail cannot execute

> **STATUS: SUPERSEDED FOR RAIL-RESOLUTION (2026-09-25).** The rail condition described below was
> worked around from the **prompt side** (an output contract that makes the reviewer's message text the
> deliverable), which produced two real `agent-claude` verdicts. It has since been **superseded as the
> governing review** by the Owner's 2026-09-25 ruling, which overrides D-2 for this run and binds
> `agent-codex` instead. The Claude non-BUILD rail defect itself remains **open** and is assigned to
> separate Relay/runtime hardening work, not to this KMO D1A run.
>
> **Revision cited below is STALE.** This doc references `d01725e…`; the current repository HEAD and the
> corrected B1 candidate are recorded in `B1-CANDIDATE-RECONCILIATION-2026-09-25.md`. Do not dispatch a
> review keyed to the SHA in this historical document.
>
> Retained as the provenance record of the original rail blocker. Nothing below is deleted.

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001` (D1A LONG_RUN, `WF-DEV-01 v1.4.0`)
Revision under review: `d01725e5ecca0cd7c3492f37b1427c6cb6e15f63`
Stop state: `BLOCKED_INDEPENDENT_REVIEW_RAIL_PERMISSION`

## What was attempted

B1 (the manifest's LR-01 + LR-02 review batch) was dispatched to the Owner-ruled
reviewer `agent-claude` through the canonical direct-executor rail.

```text
readiness(agent-claude)     = EXECUTOR_READY PASS
auth                        = claude_auth_status json_logged_in_true
invocation probe            = claude_plan_probe -> READY
execute(context_mode=INDEPENDENT-QA, timeout=1500)
  process exit              = 0
  executor_identity         = agent-claude (direct_external_process, transport_model=none)
  report written            = NO
```

The reviewer returned a plan, not a review. Its own words: it " surveyed read-only and
did not yet run tests or write the actual report". It pointed at a plan file under
`~/.claude/plans/`. **No review evidence exists**, so B1 has no verdict.

## Root cause (verified in the skill source, not inferred)

`direct_external_executors.py` decides the Claude permission mode from the context mode:

```text
line 1243-1252
  if identity == "agent-claude":
      argv = [launcher_executable, "-p", prompt, "--output-format", "text"]
      if context_mode == "BUILD":
          argv.extend(["--strict-mcp-config", "--permission-mode", "bypassPermissions",
                       "--permission-prompts", "none"])
      else:
          argv.extend(["--safe-mode", "--strict-mcp-config", "--permission-mode", "plan",
                       "--permission-prompts", "none"])
```

The comment above it is explicit that this is intended: *"Only an explicit BUILD stage gets
bypassPermissions; every other context_mode (INDEPENDENT-QA, review, ...) keeps the
historical read-only plan permission."*

Consequences for ANY non-BUILD reviewer stage:

- the reviewer can read the repository and reason about it;
- it cannot execute the test suite (`npm test`) or any build/verification command;
- it cannot write its report file.

There is no environment override: the only `os.environ` use in the executor is for the
OpenAI/Qwen provider path, not for Claude permission mode.

Additionally, `allowed_write_paths` is enforced only for the `opencode` branch
(line 1229 / line 1381). Passing it on a Claude call has no effect, so a Claude stage
cannot be given a narrow "you may write exactly this report path" exception through the
existing parameter.

## Why this is an Owner decision, not an auto-repair

`kanban-external-agent-dispatch` (Agent Relay) is a protected skill. Changing its
permission contract is a change to the execution-authority boundary, not an ordinary
repair, so it requires the Owner per the standing protected-skill rule. Hermes will not
patch it autonomously.

Two further points belong in the same ruling:

1. **The reviewer's independence requirement forbids the obvious workaround.** Hermes
   could run the suite itself and hand the raw output to a plan-mode reviewer, but then
   the reviewer would be reviewing Hermes's own execution rather than independently
   executing its own checks. `INDEPENDENT-REVIEW-POLICY` / the independent-QA contract
   require the reviewer's own first-pass evidence, so this would be a weaker artifact and
   must not be presented as equivalent.
2. **Codex has become available again.** `agent-codex` was NOT_READY at LR-00
   (`DIRECT_EXECUTOR_NOT_READY:agent-codex:sandbox_execution_failed`, raw rc
   3221225794 = 0xC0000142). The installed Relay skill is now `v2.5.5`
   (sha256 `9c2e7ccb680f7d8b…`) and adds the Windows Session-1 Codex route. Re-probing
   now returns:

   ```text
   agent-codex executable_health = PASS (codex-cli 0.156.1)
   agent-codex auth_readiness    = PASS (codex_login_status, text_authenticated)
   agent-codex invocation_probe  = PASS (codex_isolated_probe_session1, READY)
                                   provenance_session=1
                                   session_route_code=CODEX_SESSION_1_SELECTED
   agent-codex executor_ready    = true
   ```

   This does not silently change the reviewer: Owner ruling **D-2** in the locked manifest
   binds `agent-claude` as the independent batch reviewer for this D1A run, and the brief
   forbids reviewer shopping. Hermes therefore did **not** re-route to Codex on its own.
   The availability change is reported so the Owner can rule with full information.

## Options for the Owner

**A — authorize a bounded reviewer rail exception (recommended).**
Allow a non-BUILD *review* context mode to run with write access restricted to its single
report path (and read-only otherwise). This is a change to the protected skill and needs
explicit Owner authorization to modify it.

**B — re-route B1 to `agent-codex`, which is now READY.**
Cleanest technically and matches the brief's original `PRIMARY_REVIEWER = Codex` default,
but it overrides the Owner's own D-2 ruling, so it requires an explicit Owner decision.

**C — accept a documented weaker review.**
Hermes runs the deterministic gates itself and the plan-mode reviewer judges source plus
Hermes's captured raw output, with the independence limitation recorded prominently in the
verdict. This yields a real but explicitly reduced-strength review artifact.

**D — defer B1 and fold it into the B2 critical review.**
B1 stays open; LR-03/LR-04 continue and the accumulated review happens at B2. Note that
the manifest places LR-03/LR-04 at B2 CRITICAL *before any runtime apply*, and no runtime
apply is authorized, so this does not itself create a production risk. It does mean LR-01
and LR-02 would proceed unreviewed for longer than the manifest intended.

## State at this stop

```text
LR-00   PASS
LR-01   COMPLETE (3 work units PASS)
LR-02   COMPLETE (3 work units PASS, F-2 closed)
B1      BLOCKED — no reviewer verdict obtainable on the current rail
LR-03+  not started
branch  task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924
HEAD    d01725e5ecca0cd7c3492f37b1427c6cb6e15f63  (not pushed)
worktree clean
control rev 1 awaiting_review delivered 200; rev 2 waiting_owner delivered 200; outbox empty
production apply / deploy / cutover  NOT ATTEMPTED
```

## What the Owner's ruling unblocks

One decision on the reviewer rail, then Hermes runs B1 to a verdict and continues
LR-03 (B2 critical, KMO DB contract) without further Owner input.
