# HANDOFF — KMO BK01 Mac Runtime Continuation

Date: 2026-09-10
Status: READY FOR NEXT-CHAT REVIEW / EXECUTION HOLD
Owner: Free
Commander / Reviewer: Sol

## Purpose

ส่งต่อสถานะการย้ายงาน KMO BK01 จาก Windows → Mac และการเตรียม runtime/account context โดยห้ามแชทใหม่เดาจาก chat history.

งานถัดไปคือ lock execution plan บน Mac ให้ KMO ใช้ infra ของ KMO เอง โดยไม่ต้อง logout/login สลับกับงาน WSTERA ถ้าไม่จำเป็น.

## Canonical Workflow Source

Source of Truth: `Gutumrod/wstera-workflows`
Registry: `WORKFLOW-REGISTRY.md` — Registry Version `1.1.0`, ACTIVE, verified 2026-09-10.
Candidate workflow for non-trivial bounded implementation/remediation: `WF-DEV-01` Spec Version `1.1.0`.
Agent dispatch policy: `policies/AGENT-DISPATCH-POLICY.md` Version `1.0.0`.

Mandatory rule before execution: pin Workflow ID + Spec Version + selection reason + entry conditions PASS/HOLD.
If any agent (AGY/Claude/Codex/Qwen/verifier) is dispatched for non-trivial work, create a canonical Agent Dispatch Packet first.

## Current Mac Workspace

Workspace: `/Users/wachirayachankhonkan/AI-Workspace/projects/kmorackbarcustom.github.io`
Pilot repo: `/Users/wachirayachankhonkan/AI-Workspace/projects/kmorackbarcustom.github.io/bk01-pilot`
Current branch: `pilot/bk01-independent-deployment`
Current HEAD: `4e164eaee2c0d68ca184ec6aa6fec00383715563`
Repo relation to origin: local branch is ahead 12 commits; DO NOT PUSH unless Owner explicitly authorizes.
Windows checkpoint transferred and verified on Mac; current HEAD matches the final Windows checkpoint.

## Current Worktree State

Current worktree is NOT clean.
Known untracked paths at handoff time:
- `docs/BRIEF-CODEX-KMO-MAC-ENV-PLACEMENT-2026-09-10.md`
- `supabase/.temp/`
- this handoff file will also be untracked until explicitly committed.

Do not reset/clean/stash/delete unrelated files automatically. Inspect before changing anything.

## ENV / Secrets State

Central secret storage exists:
`/Users/wachirayachankhonkan/AI-Workspace/.secrets/kmo/`

Subdirectories:
- `booking-admin/`
- `booking-consumer/`

Codex copied env into application destinations successfully:
- `apps/booking-admin/.env.local` — exists, mode `0600`
- `apps/booking-consumer/.env.local` — exists, mode `0600`

Reported key count: Admin 14, Consumer 14.
Source secret files remain in `.secrets/kmo`; application copies are normal files, not symlinks.
Do not print secret values. Do not commit `.env.local`.

## Supabase Current State
Supabase CLI version on Mac: `2.116.0` (2.117.0 available; update not required for continuation).

Main Supabase login was restored and verified to see both KMO and WSTERA resources in one account context.
Relevant visible projects include:
- `KMO-Booking` → `xfhpwxjywqgqefbncumm`
- `kmo-hr` → `ybyseaenceyswjnwdmdf`
- `wstera-lab` → `ykxlqnshaaxmzzocpjlj`
- `wstera-control` → `plvpbribiomqppfokzir`

Important finding: `supabase login --name ...` names the dashboard token; it does NOT create an independent local CLI auth profile.
Existing `~/.supabase/profiles/kmo.yaml` is metadata/config and is not a usable auth profile for `--profile kmo` in this CLI state.

Preferred architecture for Supabase now: keep the single main login that already has access to KMO + WSTERA, and isolate each repo by exact `project-ref` link.

Current KMO repo link state: `project_ref=MISSING`.
Therefore KMO BK01 is NOT yet linked to `xfhpwxjywqgqefbncumm` on this Mac.
Do not run migrations or schema changes as part of link setup.

## Cloudflare / Wrangler Current State

Project-local Wrangler: `4.125.0`.
`wrangler auth list` currently shows only:
- `default` → no bound directory

No KMO named Cloudflare profile is active yet.
Wrangler supports named auth profiles and directory binding via `wrangler auth create <name>` and `wrangler auth activate <name> [dir]`.

KMO expected Cloudflare account ID: `c7d775fe2e3175ca58c0959867814998`.
Expected Workers:
- Admin: `kmo-booking-admin.kmo-rackbarcustom.workers.dev`
- Consumer: `kmo-booking-consumer.kmo-rackbarcustom.workers.dev`

Dark deploy safety rule: Consumer normal config contains cron `*/5 * * * *`; dark deployment must use `wrangler.dark.jsonc` only until Owner explicitly authorizes otherwise.

## KMO Infrastructure Ownership Rule

KMO is an independent downstream deployment.
KMO owns its GitHub / Cloudflare / Supabase / runtime secrets.
WSTERA/BK01 canonical source is upstream/reference; do not move KMO runtime ownership back into WSTERA infrastructure.
Access through Owner's main collaborator/developer account is acceptable when permissions allow, but resource target must remain KMO-owned.

## Execution Gate for Next Chat

Current execution state: `HOLD`.
Reason: canonical flow was only just loaded; current continuation branch does not yet satisfy a freshly initialized `WF-DEV-01 v1.1.0` task contract, and worktree has known untracked state.

Before any non-trivial execution, next chat must:
1. Read this handoff and the current KMO repo evidence.
2. Re-read `WORKFLOW-REGISTRY.md`, `WF-DEV-01-STANDARD-BUILD.md`, and `AGENT-DISPATCH-POLICY.md` from `Gutumrod/wstera-workflows`.
3. Create/stabilize a Task ID and Task Checkpoint.
4. Decide whether existing `pilot/bk01-independent-deployment` is an accepted continuation baseline or a new `task/<TASK-ID>-<slug>` branch is required.
5. Set `Entry Conditions = PASS` only after branch/worktree/scope/acceptance conditions are actually satisfied.

## Recommended Next Plan to Lock
Recommended sequence after Flow Selection Gate passes:
1. Verify/clean only authorized transient state; preserve unrelated work.
2. Link this repo to Supabase project `xfhpwxjywqgqefbncumm` with no migration/change.
3. Verify linked project ref and read-only connectivity.
4. Create Cloudflare named auth profile `kmo` using the KMO Cloudflare account.
5. Verify `whoami --profile kmo` resolves account ID `c7d775fe2e3175ca58c0959867814998`.
6. Bind `kmo` profile only to the BK01 pilot directory and verify other workspaces remain on default.
7. Re-run local tests/lint/build and secret-leak checks before any deployment decision.
8. Inspect current remote Worker versions and runtime state read-only.
9. STOP for Owner review before deploy/cutover.

## Git / Remote Evidence

Origin:
`https://github.com/kmorackbarcustom/kmorackbarcustom.github.io.git`

Both application `.env.local` files are explicitly ignored by their respective `.gitignore` rules (`.env*`).

## Hard Stops

- DO NOT PUSH unless Owner explicitly says push.
- DO NOT DEPLOY unless Owner explicitly authorizes deployment stage.
- DO NOT run Supabase migrations/schema changes during account/link setup.
- DO NOT use normal consumer Wrangler config for dark deploy; use `wrangler.dark.jsonc` only when authorized.
- DO NOT print/copy secret values into chat, docs, logs, Git, or dispatch packets.
- DO NOT reset/clean/stash/delete unrelated worktree changes automatically.
- DO NOT treat `READY FOR REVIEW` as PASS.
- No evidence = no PASS claim.

## First Response Expected From Next Chat
Next chat should first report:
- selected Workflow ID + Spec Version
- reason for selection
- exact repo/branch/HEAD/worktree state
- Task ID / checkpoint proposal
- Entry Conditions = PASS or HOLD with reasons
- proposed bounded execution plan

Only after Owner accepts the plan should execution begin.

## Current Overall Handoff Verdict

Mac migration foundation: READY.
ENV placement: PASS.
Supabase account visibility: PASS for both KMO and WSTERA under the main login.
Supabase KMO project link: NOT DONE.
Cloudflare KMO named profile/binding: NOT DONE.
Deploy/cutover: NOT AUTHORIZED / NOT DONE.
Workflow-aware next-stage execution: HOLD pending next-chat flow/task lock.
