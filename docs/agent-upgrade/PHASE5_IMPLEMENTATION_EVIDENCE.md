# Phase 5 — LINE Image Understanding Implementation Evidence

**Date:** 2026-08-29
**Implementation commit:** `12a6dff`
**Brief commit:** `adb48ed`
**Production function:** `line-webhook` v46 (entrypoint pins `4b98aac`; v42 was the original Phase 5 deploy)
**Current rollout:** `line_ai_image_rollout=all` (owner expanded it; verified live 2026-09-03)
**Phase status:** RELEASED TO ALL / E2E EVIDENCE NOT RECORDED — NOT CLOSED

## Implemented
- LINE image content download with 10 MiB bounded read
- JPEG / PNG / WebP magic-byte validation
- external content-provider fail-closed; no arbitrary URL fetch
- `gemma4:31b-cloud` vision-only extractor with strict structured JSON contract
- degenerate-output rejection before parsing
- synthetic `[IMAGE_OBSERVATION]` history; no raw image/base64 persistence
- DeepSeek remains production conversation/agent model and tools remain business truth
- image Reply-first / Push-fallback path
- safe customer fallback + staff notification on image/vision failure
- separate `line_ai_image_rollout` kill switch

## Automated verification
- Temporary isolated Deno 2.4.5 runner used; no permanent project dependency added.
- All `_shared/*.test.ts`: **31 passed / 0 failed**.
- `git diff --check`: PASS before implementation commit.
- Full webhook `deno check` is blocked by pre-existing vendored Buffer/sloppy-import compatibility; no new-file type error remained.
- Supabase deploy itself bundled and accepted the function successfully.

## Production verification
- Phase 5 setting created with default `off`, then intentionally moved to `owner_only`.
- `line_ai_rollout` remains `all` for existing text AI.
- `line-webhook` deployed as version 42.
- `verify_jwt=false` verified after deploy.
- No production order/booking data changed.
- `internal-proxy` and vendored `line-oa-ai-module` were not modified.

## Remaining Gate (updated 2026-09-03)
Rollout is already `all` — the owner expanded it and ran a live test himself. Reported result: the vision path recognises bank slips and `notifyStaffOfPaymentProof` fires a Telegram staff alert immediately. That covers the payment-proof / visible-text case.

What is missing is **written evidence**, not the test. Every Telegram payment-proof alert embeds the real LINE `messageId`, so those messages are usable raw evidence. Outstanding matrix cases: full-bike photo, close-up part, text-then-image session continuity, and an out-of-context image (must not invent service/product). Phase 5 stays NOT CLOSED until those results are recorded here.

Verified live 2026-09-03: `verify_jwt=false` on v46; `internal-proxy` and vendored `line-oa-ai-module` untouched; no raw image/base64 in session history.
