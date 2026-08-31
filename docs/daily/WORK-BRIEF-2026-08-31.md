# Daily Work Brief — 2026-08-31

**Project:** KMO Rack Bar Custom
**Priority:** Owner live E2E for Phase 5
**Verified on disk:** `main @ 4b98aac`; pre-existing untracked `docs/daily/` and generated `supabase/functions/line-webhook/bundle.js` / `bundle.min.js`.

## Current state

- Phase 4 Booking Payment Grounding is local-only PASS and not deployed.
- Phase 5 LINE Image Understanding is deployed as `line-webhook` v42 with `line_ai_image_rollout=owner_only`; it is not CLOSED.
- Remaining Phase 5 gate is owner-run live LINE image testing with real LINE message IDs across the approved five-case matrix.
- Last recorded isolated test result is 31 passed / 0 failed; latest implementation commit `4b98aac` notifies staff on payment-proof submission.

## Work today, in order

1. Re-read the approved Phase 5 brief/evidence and enumerate the exact five live cases before testing.
2. Owner sends real inbound LINE images for each case; capture message timestamps/correlation safely without recording tokens or unnecessary personal data.
3. For each case verify image retrieval, model/tool routing, grounded response, staff notification where applicable, failure handling, and absence of unsupported payment/order claims.
4. Record pass/fail per case. Investigate and remediate failures before any rollout change.
5. Only if all five cases pass, request/perform separately authorized rollout change to `all` and record Phase 5 CLOSED evidence.
6. Decide Phase 4 deployment separately after Phase 5 closure.

## Blocked / dependencies

- Phase 5 closure is blocked on the owner and real inbound LINE images/message IDs.
- Rollout-to-all and Phase 4 deployment are production mutations requiring explicit authorization.

## Do not repeat

- Do not mark Phase 5 CLOSED or set rollout to `all` without all five live cases passing.
- Do not modify `internal-proxy` or vendored `line-oa-ai-module`.
- Do not commit generated bundle artifacts without an explicit build-artifact policy decision.
- Do not conflate local Phase 4 PASS with production deployment.

## Evidence to produce

- Five-row live E2E matrix with input type, expected behavior, observed behavior, sanitized correlation, and verdict.
- Runtime/version/config proof showing the tested Worker and owner-only rollout.
- Failure logs/screenshots with secrets and customer data redacted.
- If all pass, explicit rollout authorization plus post-change smoke and Phase 5 closure record.
