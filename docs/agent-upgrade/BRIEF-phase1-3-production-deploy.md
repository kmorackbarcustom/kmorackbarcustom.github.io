# BRIEF — KMO LINE AI Phase 1–3 Production Deploy

**Date:** 2026-08-29
**Repository:** `D:\AI-Workspace\projects\kmorackbarcustom.github.io`
**Branch:** `main`
**Required reviewed code commit:** `cc301dd`
**Current production:** `line-webhook` v42
**Final review:** PASS
**Deploy authorization:** PENDING OWNER APPROVAL

## Objective
Deploy the reviewed incident remediation chain to the existing KMO LINE webhook without changing unrelated production behavior.

Included code:
- Phase 1 Grounding Contract — `71b0c0f`
- Phase 2 Structured Reschedule State — `0c52fd3`
- Phase 3 Output Grounding Guard — `3cdf490`
- Final-review normalization remediation — `cc301dd`

## Hard deployment constraints
- Deploy only the `line-webhook` function bundle and its required relative dependencies.
- Preserve `verify_jwt=false` exactly as production currently uses.
- Do not run migrations.
- Do not update `orders` or `bookings` as part of deployment.
- Do not change model, rollout, image rollout, session TTL or production settings.
- Do not modify or deploy `modules-hub`.
- Do not deploy any other Edge Function.

## Pre-deploy gate
Before deployment, verify:
1. `git status --short` is clean.
2. `cc301dd` is an ancestor of HEAD, and there are no code changes after `cc301dd` in the `line-webhook` deployment bundle; docs-only checkpoint commits are allowed.
3. Relevant Deno checks still pass.
4. Full `_shared/*.test.ts` remains green with the same test setup.
5. `git diff --check` is clean.
6. Production `line-webhook` is still the expected version/config or any drift is reviewed first.

If production drift is detected, STOP. Do not overwrite a newer production function blindly.

## Deploy action
Create one new Supabase Edge Function version for `line-webhook` from the reviewed local source.

The deployment must preserve the current webhook authentication setting:

```text
verify_jwt=false
```

After deployment, immediately read production function metadata and confirm:
- new version is `ACTIVE`;
- `verify_jwt=false`;
- only `line-webhook` version changed;
- no database migration or production-setting mutation occurred.

## Required post-deploy smoke matrix
Use controlled test traffic. Do not mutate real customer orders to manufacture a test result.

1. **General chat** — ordinary shop/FAQ question still receives a normal answer.
2. **Order status** — existing authorized test user receives only grounded status/vehicle/date facts.
3. **Status localization** — canonical status such as `done` may safely render as the existing Thai business label.
4. **Date localization** — stored ISO date may safely render in equivalent Thai date form.
5. **Reschedule start** — `ขอเลื่อนคิว` enters structured reschedule flow.
6. **Ambiguous follow-up** — a lone date while both fields are unknown asks which date it means.
7. **Incident regression** — `Sumo` followed by Saturday → Monday must never become `รถรุ่น SUMO`.
8. **Explicit vehicle** — `รถผมรุ่น PCX` may support a PCX vehicle claim.
9. **Unsupported claim** — an ungrounded vehicle/status/date claim must be removed or replaced by the safe fallback.
10. **Cleanup** — after reschedule complete/cancel, later ordinary messages are not captured by stale state.

If image rollout is active for the test account, send one normal supported image and verify the existing image path still works. Do not expand image rollout during this deploy.

## Monitoring
Review Edge Function logs after smoke tests for:
- generation/provider failures;
- output-grounding block reasons;
- reschedule completion/cancel behavior;
- LINE reply failures and push fallback;
- unexpected 4xx/5xx responses.

## Failure / rollback gate
If deployment activates but critical smoke behavior fails:
- stop testing that can affect customers;
- do not alter customer/order data to hide the failure;
- restore the last known-good `line-webhook` code/config using the preserved production v42 source;
- keep `verify_jwt=false` during rollback;
- verify rollback version is `ACTIVE`;
- record failure evidence before another remediation attempt.

Rollback is an Edge Function code rollback only. No database rollback is expected because Phase 1–3 add no migration.

## Acceptance gate
Deployment is PASS only when:
- reviewed source is active in production;
- webhook authentication config is preserved;
- smoke matrix passes for the applicable controlled cases;
- no unrelated production function/settings changed;
- no customer/order data was mutated for testing;
- production logs show no new critical error;
- deployment evidence and final production version are documented.

After PASS, update current project docs and incident status. If any required smoke test fails, mark deployment BLOCKED and STOP.
