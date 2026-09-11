# BRIEF-KMO-MAC-RUNTIME-CONTEXT-001

Task ID: KMO-MAC-RUNTIME-CONTEXT-001
Workflow: WF-DEV-01@1.1.0
Author: Sol
Status: LOCKED

## Problem

The Mac has the transferred KMO BK01 workspace and secrets, but provider targeting is not yet repo-safe: Supabase is not explicitly linked to `KMO-Booking`, and Cloudflare has no KMO directory-bound auth profile. Work must not accidentally target WSTERA/default resources.

## User

Owner/operator of KMO RACKBARCUSTOM and the independent KMO BK01 deployment.

## Scope

### In Scope

- Pin this repo to Supabase project ref `xfhpwxjywqgqefbncumm` with no migration/schema change.
- Verify read-only Supabase project identity/connectivity.
- Create/verify Cloudflare auth profile `kmo` for KMO account `c7d775fe2e3175ca58c0959867814998`.
- Bind the KMO Cloudflare profile only to this BK01 pilot directory.
- Verify local tests/lint/build and secret exclusion as practical after context setup.
- Inspect remote Worker identity/state read-only if provider auth is available.

### Out of Scope

- Deploy, cutover, custom domains, cron activation, migrations, schema changes, data writes, secret rotation, canonical BK01 changes, WSTERA infra changes, push/merge.

## Architecture

Identity may be shared where the provider supports cross-project access, but resource ownership, repo links, Cloudflare profile binding, secrets, and deployment targets remain isolated by project/repo.

## Data

No application or database data mutation is authorized. Supabase operations are configuration/link and read-only verification only.

## Workflow

WF-DEV-01 v1.1.0. This is bounded environment/runtime-context setup with no unresolved contract-changing product decision. No agent dispatch is required for direct Sol execution in this task.

## Failure Cases

- Supabase link resolves to a project other than KMO-Booking -> STOP.
- Cloudflare KMO profile resolves to the wrong account -> STOP.
- Any command would migrate schema, deploy, activate cron, modify WSTERA resources, expose secrets, or require guessing credentials -> STOP.
- Existing unrelated worktree changes appear -> preserve and STOP before destructive cleanup.

## Security / Invariants

- Never print secret values.
- `.env.local` remains ignored/untracked.
- No migrations or DB writes.
- No deploy or push.
- Consumer dark deploy, when separately authorized later, must use `wrangler.dark.jsonc`; normal config contains cron.
- KMO infrastructure remains KMO-owned.

## Source of Truth

Current `Gutumrod/wstera-workflows` registry/policies, this task/brief, KMO continuation handoff, KMO-first decision, and live provider identity checks.

## Allowed Paths

- KMO BK01 repo configuration/evidence paths only.
- Local provider CLI metadata needed for repo binding, without exposing credentials.

## Prohibited Paths

- Canonical BK01/WSTERA source or infrastructure.
- Secret values or committed `.env.local`.
- Production deploy/cutover surfaces.

## Acceptance Criteria

- Task branch and checkpoint persist cleanly.
- Supabase repo binding proves KMO-Booking and no migration/schema mutation occurs.
- Cloudflare KMO profile proves the intended KMO account and is bound only to the KMO BK01 directory.
- WSTERA/default Cloudflare context is not rebound.
- Local verification passes and remote Worker inspection is read-only.
- Final state is READY FOR OWNER REVIEW — NO DEPLOY.

## Required Evidence

Exact repo/branch/commit, provider identity checks, local binding files/metadata without secrets, test/lint/build results, secret-exclusion checks, git status.

## Stop Conditions

Stop immediately on identity mismatch, provider ambiguity, migration/deploy prompt, secret exposure risk, or unexpected unrelated worktree mutation.

## Owner Decisions

KMO is an independent deployment using KMO-owned GitHub, Cloudflare, Supabase, and secrets. No push or deploy in this task. Decision gaps: NONE.
