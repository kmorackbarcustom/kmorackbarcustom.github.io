# BRIEF — CODEX KMO MAC ENV PLACEMENT

Date: 2026-09-10
Scope: KMO BK01 Mac workspace only

## Objective
Place the existing KMO environment files from the dedicated secret store into the two BK01 app runtime locations on this Mac, without exposing, editing, committing, pushing, or deploying any secret material.

## Source directories
- `/Users/wachirayachankhonkan/AI-Workspace/.secrets/kmo/booking-admin/`
- `/Users/wachirayachankhonkan/AI-Workspace/.secrets/kmo/booking-consumer/`

## Required destinations
- Admin → `/Users/wachirayachankhonkan/AI-Workspace/projects/kmorackbarcustom.github.io/bk01-pilot/apps/booking-admin/.env.local`
- Consumer → `/Users/wachirayachankhonkan/AI-Workspace/projects/kmorackbarcustom.github.io/bk01-pilot/apps/booking-consumer/.env.local`

## Execution rules
1. Inspect only filenames/metadata needed to identify the intended env file in each source directory. Do not print secret values.
2. If exactly one intended env file is present in each source directory, copy it to the corresponding destination as `.env.local`.
3. Preserve the source files in `.secrets/kmo`; do not move or delete them.
4. Do not modify any env values.
5. Set destination file permissions to owner read/write only where supported (`chmod 600`).
6. Do not create symlinks; use normal file copies.
7. Do not modify source code, package files, lockfiles, Cloudflare config, Supabase config, or Git history.
8. Do not commit, push, deploy, login to providers, or run migrations.
9. If more than one plausible env file exists in either source directory, STOP and report ambiguity instead of guessing.

## Verification required
After copying, report only non-secret evidence:
- source file identified for Admin: filename only
- source file identified for Consumer: filename only
- Admin destination exists: PASS/FAIL
- Consumer destination exists: PASS/FAIL
- Admin key count: integer only
- Consumer key count: integer only
- destination permissions: metadata only
- `git status --short` contains no env file: PASS/FAIL
- confirm no secret value was printed to stdout/stderr

Expected result: both runtime `.env.local` files are present, source copies remain in `.secrets/kmo`, Git remains free of secret files, and no deployment or provider action occurs.

## STOP conditions
STOP without copying if source identity is ambiguous, a destination resolves outside the KMO BK01 paths above, or any command would expose secret values.
