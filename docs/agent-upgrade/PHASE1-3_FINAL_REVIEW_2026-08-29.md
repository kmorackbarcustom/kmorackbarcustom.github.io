# KMO LINE AI — Phase 1–3 Final Review

**Date:** 2026-08-29
**Repository:** `D:\AI-Workspace\projects\kmorackbarcustom.github.io`
**Branch:** `main`
**Pre-fix baseline:** `bea5202`
**Current reviewed HEAD:** `cc301dd`
**Production function:** `line-webhook` v42
**Production verify_jwt:** `false`
**Verdict:** PASS — READY FOR CONTROLLED DEPLOY, NOT DEPLOYED

## Incident
Production conversation misclassified customer name `Sumo` as a vehicle model and replied with `รถรุ่น SUMO`.

Verified root cause was a conversation-state + grounding failure, not direct LINE profile injection:
- `Sumo` existed in the customer's real message body.
- The failing turn did not call `get_order_status`.
- No structured pending-field state existed for the reschedule follow-up.
- The model inferred a factual field from ambiguous free text.
- The old order tool exposed too little authoritative business data.

## Remediation chain
1. Phase 1 — Grounding Contract — `71b0c0f`
2. Phase 2 — Structured Reschedule State — `0c52fd3`
3. Phase 3 — Output Grounding Guard — `3cdf490`
4. Final-review remediation — `cc301dd`

## Final-review finding and fix
The first Phase 3 guard was intentionally fail-closed but compared some factual values too literally.

Production stores canonical order status such as `done`, while customer-facing replies naturally say `เสร็จแล้ว`. Production dates are stored as ISO strings such as `2026-08-31`, while Thai replies may say `31 ส.ค. 2569`.

A production-like probe proved both valid claims were being blocked. This was treated as a deployment blocker, not accepted as harmless over-blocking.

`cc301dd` fixes the blocker by:
- mapping canonical status codes through the existing `STATUS_LABELS` business mapping;
- normalizing ISO, numeric and Thai date forms;
- converting Buddhist Era years to Gregorian for comparison;
- preserving fail-closed behavior when the claimed year is actually wrong.

Verified examples after remediation:
- authoritative `status: done` → `งานเสร็จแล้วครับ` passes;
- authoritative `2026-08-31` → `31 ส.ค. 2569` passes;
- authoritative `2026-08-31` → `31 ส.ค. 2570` is blocked;
- `รถรุ่น SUMO` remains blocked when `Sumo` is only the customer name;
- authoritative `Suzuki V Strom 800 de` remains allowed.

## Automated verification
- Relevant new/changed `_shared` modules: `deno check` PASS.
- Full `_shared/*.test.ts` with test-only LINE env values + `--sloppy-imports`: **60 passed / 0 failed**.
- `git diff --check`: PASS before remediation commit.
- Phase 1 grounding regression: PASS.
- Phase 2 reschedule/state regression: PASS.
- Phase 3 output grounding regression: PASS.

## Known pre-existing verification limitation
A full `line-webhook/index.ts` type-check is still blocked by the pre-existing vendored Node `Buffer` / extensionless-import compatibility issue. This limitation predates Phase 1–3 and is already recorded in `PHASE5_IMPLEMENTATION_EVIDENCE.md`.

No new-file type error remains, and Supabase has previously bundled the same vendored webhook stack successfully.

## Safety review
- No schema migration added.
- No automatic order/booking date mutation added.
- Existing LINE-user identity isolation remains intact.
- Booking phone fallback remains unlinked-only.
- No model, rollout, session TTL or image-flow change.
- No external AI judge/call added for output guard.
- `modules-hub` was not modified.
- Upstream observations remain candidate-only documentation.

## Production truth at review time
Read-only Supabase verification after `cc301dd`:
- `line-webhook` is still production version **42**.
- Status is `ACTIVE`.
- `verify_jwt=false` is still required and active for the LINE webhook authentication flow.
- Production v42 does not yet contain Phase 1–3 or `cc301dd`.

## Gate result
Phase 1–3 code review and remediation: **PASS**.

This is a deployment-readiness verdict only. Incident remediation is **not production-closed** until controlled deploy and post-deploy smoke verification pass.
