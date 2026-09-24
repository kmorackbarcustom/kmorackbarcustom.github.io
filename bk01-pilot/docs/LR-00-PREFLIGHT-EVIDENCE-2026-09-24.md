# LR-00 PREFLIGHT EVIDENCE — KMO-DOMAIN-BOOKING-READINESS-001 (D1A LONG_RUN)

Date: 2026-09-24 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Stage: `LR-00 — Preflight / source freeze`
Result: **LR-00 = PASS** (with two recorded Owner-ruled deviations D-1/D-2)
Manifest: `RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md` → `LOCKED`

## 1. Repository / base identity

```text
repo                kmorackbarcustom/kmorackbarcustom.github.io
prepared tag        refs/tags/kmo-bk01-d1a-longrun-prepared-20260924
resolved tag target ac3c14746d87e2a6038d63e39715f30a8384b598
                      (local == origin via git ls-remote)
evidence anchor     30c7e44ad86bc462683b97dab417cb22388bb908
descent check       git merge-base --is-ancestor 30c7e44 ac3c147 -> exit 0 (ANCESTOR=YES)
delta after anchor  git diff --name-status 30c7e44..ac3c147 -> 5 files, all under bk01-pilot/docs/
                      A BRIEF-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md
                      A PLAN-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md
                      A REPORT-SOL-KMO-BK01-SEED-ADOPTION-INDEPENDENT-VERIFICATION-2026-09-24.md
                      A RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md
                      M DOCUMENTATION_INDEX.md
                      => DOCUMENTATION-ONLY confirmed; apps/ supabase/ tests/ order/ untouched
implementation branch task/KMO-DOMAIN-BOOKING-READINESS-001-d1a-long-run-20260924
implementation worktree D:/AI-Workspace/runtime/worktrees/kmo-d1a-longrun-20260924
                      (created via native path; verified with `git worktree list` — no `D:/d` escape)
worktree state       clean at creation; HEAD == ac3c147
```

Domain target reconciliation (required HOLD condition checked):

```text
expected Domain SHA 058fe5211c9eb39d7dda3087ec40b1e896227113
local  Domain      058fe5211c9eb39d7dda3087ec40b1e896227113
origin Domain      058fe5211c9eb39d7dda3087ec40b1e896227113
=> no advance, no reconciliation required
```

Working-tree content identity: `bk01-pilot/package-lock.json` sha256
`1ccb9ec72a3a167e2608d5ac8283cbd36798c1ab2a6c7196de99eb755f89809f`.

## 2. Workflow / runtime provenance

```text
Workflow Registry   1.6.0
WF-DEV-01           1.4.0            (execution mode LONG_RUN)
WF-RELAY-01         1.3.0            -> runtime kanban-external-agent-dispatch v2.5.3 (registry text)
workflow authority  Gutumrod/wstera-workflows origin/main@c8f41ac2b51445af2e7095995be17132d103064a
installed Relay     v2.5.4 (SKILL.md + RELEASE-MANIFEST.json)
                    SKILL.md sha256 c46bca5447696aeafcbb3b1506dbaf1ca22cdc1a8fc26d0df1d17e35abd0dcf2
                    direct_external_executors.py sha256 705083a92130f386d94e5f74ad5265a2f85ac49acda06b8a3b1d0e6fb181ebc1
HERMES_HOME         D:\AI-Workspace\runtime\hermes-native\data (canonical; user+process bound)
execution engine    hermes-native-swarm v0.1.1
                    swarmctl.py sha256 635d0d19e46da6f9b364c1c58956fa9bfc103a44a143bb211f4a21662dd5db2f
```

### Version drift recorded (not repaired by this run)

Registry `1.6.0` and `WF-RELAY-01 v1.3.0` name runtime `kanban-external-agent-dispatch v2.5.3`;
the installed runtime on this host is `v2.5.4`. Relay preflight treats a runtime mismatch as HOLD.
`v2.5.4` also enforces `PIN_CODEX = openai / gpt-6-luna / reasoning_effort=medium`, while the
brief/plan/registry pin Codex to `gpt-5.6-luna`. Both models are live-usable on this host:

```text
codex exec --sandbox read-only -m gpt-6-luna  -> exit 0, exact READY (stderr: model: gpt-6-luna / provider: openai)
codex exec --sandbox read-only -m gpt-5.6-luna -> exit 0, exact READY
```

This Task must not edit global model/runtime configuration, so the divergence is recorded as provenance only.

## 3. Named-executor readiness (measured this run)

```text
agent-claude   READY    version 2.1.269 (Claude Code)   execution_backend direct_external_process
agent-codex    NOT_READY  DIRECT_EXECUTOR_NOT_READY:agent-codex:sandbox_execution_failed
agent-agy      READY    version 1.2.9
agent-qwen     READY    version 0.23.3
agent-opencode NOT_READY  DIRECT_EXECUTOR_NOT_READY:agent-opencode:invocation_failed
```

### agent-codex root cause (why D-2 fallback is valid)

```text
probe     codex sandbox --permission-profile :read-only -C <ws> powershell -NoProfile -Command "...READY"
measured  returncode 3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED)
```

This is the previously documented host session-0 restricted-token child-launch condition
(vault `04_Technical_Ref/host-tooling-and-git-rules.md` §7 and `01_Projects/agent-session-ledger.md` §3.1),
**not** a Codex model-pin fault. Per `policies/INDEPENDENT-REVIEW-POLICY.md`, evidenced
`EXECUTOR_NOT_READY` is an allowed fallback-reviewer condition.

### agent-opencode additional finding

```text
layer A: invocation failed while cwd carried the MSYS PWD variable
         -> `Failed to change directory to /d/AI-Workspace/...`
layer B: with PWD removed from the child environment
         -> `provider.auth ... Unauthorized (401)`
```

OpenCode is therefore not dispatchable in this run either way. It is not used as a lane:
D-1 moves worker execution to the native swarm pool.

## 4. Native swarm preflight (executed)

```text
python swarmctl.py profiles --store <HERMES_HOME>/profiles
  state SWARM_WORK_UNIT_PASS · classification None
  baseline_model deepseek-v4.1-flash:cloud · allowed_models [deepseek-v4.1-flash:cloud]
  swarm-inspector | inspection            | deepseek-v4.1-flash:cloud | ollama-cloud | problems []
  swarm-builder   | implementation        | deepseek-v4.1-flash:cloud | ollama-cloud | problems []
  swarm-tester    | testing               | deepseek-v4.1-flash:cloud | ollama-cloud | problems []
  swarm-db        | database_qualification| deepseek-v4.1-flash:cloud | ollama-cloud | problems []
  swarm-release   | release_qualification | deepseek-v4.1-flash:cloud | ollama-cloud | problems []
  swarm-evidence  | evidence_preparation  | deepseek-v4.1-flash:cloud | ollama-cloud | problems []

python swarmctl.py header-check --header <LR-00 header>
  state SWARM_WORK_UNIT_PASS · reasons [HEADER_ACCEPTED]
  checks governance_header_valid PASS

python swarmctl.py plan --run <LR-00 run spec>
  state SWARM_WORK_UNIT_PASS · reasons [PLAN_VALIDATED, NO_WORKER_DISPATCHED]
  checks governance_header_valid PASS · profile_inventory_exact PASS
         limits_enforced PASS · workspace_collision_check PASS
  limits max_concurrent_workers 3 · max_spawn_depth 1 · self_delegation false
         self_approval false · cross_lane_mutable_workspace_sharing false
         ordinary_agent_relay_execution false
```

### Executed read-only lane (live dispatch proof, not a dry run)

```text
python swarmctl.py run --run <LR-00 run spec> --execute --lane-timeout 320
  lane LR00-INSPECT-01 · worker swarm-inspector · capability inspection
  engine hermes-native · model deepseek-v4.1-flash:cloud · provider ollama-cloud
  relay_path_used false · spawn_depth 1 · self_delegation false · self_approval false
  lane state SWARM_WORK_UNIT_PASS · reasons [PASS_CONSTRUCTED_FROM_POSITIVE_PROOF]
  commander check head_exists: executed true, exit_code 0, result PASS
  invocation exit_code 0 · stdout_sha256 d3ea10737899d4bbf29bd2b0e6ab09dbffb87594073997cf0592564ba02d29e4
  evidence file sha256 ce54a46e0f2066e4f01c2c5e30a4c0ee849386768055ae09014ee2ea6420a121
  prompt stored as sha256+bytes only (body_persisted false) · redaction findings []
  session_id 20260924_181630_21550e
```

Independent worker output agreed with the controller-side checks: it reported HEAD
`ac3c14746d87e2a6038d63e39715f30a8384b598` (matching the declared revision), the branch
`prep/kmo-bk01-upstream-seed-20260924`, the tag target, and `merge-base --is-ancestor 30c7e44 HEAD` exit 0.

Scratch/evidence produced inside the worktree was copied out to local temp and removed; the worktree was
verified clean again afterwards. **No product patch was made by LR-00.**

## 5. Baseline deterministic gates (on the untouched base)

```text
npm ci                     EXIT 0 · added 694 packages
npm test                   EXIT 0 · tests 30 / pass 30 / fail 0 / skipped 0
npm run lint               EXIT 0 · consumer 0 errors 7 warnings · admin 0 errors 1 warning
npm run build              EXIT 0 · Next.js compiled successfully, TypeScript finished, 10/10 static pages
```

Build prerequisite note: `prebuild` runs `scripts/sync-env.js`, which exits 1 when `bk01-pilot/.env.local`
is absent. That file is gitignored (`bk01-pilot/.env.local`, .gitignore:13). For the baseline build this worktree
was given a **placeholder, non-secret** `.env.local` derived from `.env.example`; no real KMO credential was copied,
printed, or written. Consequence recorded: the baseline build proves compile/config wiring only, not runtime
connectivity. `git check-ignore -v .env.local` confirms it stays untracked.

## 6. Scope confirmation

```text
product source changed by LR-00      NONE (only docs/tasks/TASK-...md and the Run Manifest were updated)
SQL changed by LR-00                 NONE
routes added/changed by LR-00        NONE
public.orders / production_allocations touched  NO
Order / Claim / KMO Control touched             NO
production mutation / deploy / cutover          NOT ATTEMPTED
```

## 7. LR-00 verdict

```text
LR-00 PREFLIGHT = PASS
RUN MANIFEST = LOCKED (Owner Approval = YES)
READY FOR LR-01
```

Two deviations from the brief's default workflow pin are Owner-ruled and recorded above (D-1 engine, D-2 reviewer).
No unresolved authority conflict remains for this run.
