# Brief — LINE Webhook Idempotency and Delivery Outcomes

**Date:** 2026-10-21  
**Base:** `main` at `746c17731c19f8c68c591cf81caf13ebdb169274`, plus the existing uncommitted model-tag change; preserve those changes.  
**Status:** LOCAL CANDIDATE — TypeScript verification and model evaluation pass. PostgreSQL execution of the migration and live LINE acceptance remain pending. No production migration or deploy authorized by this brief.

## Progress and verification — 2026-10-21

- Owner policy confirmed: for a new booking/new work request, do not look up or mention an existing order unless the customer explicitly refers to it or asks about its status.
- Exact-tag synthetic tool/grounding evaluation: `deepseek-v4.1-flash:1017-cloud`, 8/8 scenarios passed, 6 fixture tool calls; no customer or production order data used. A first output review found an unscored Chinese sentence in the greeting, so the source prompt and harness gained Thai-language checks; the exact-tag evaluation was rerun and passed 8/8 with those checks. No real LINE round-trip has been run.
- `deno check supabase/functions/line-webhook/index.ts scripts/evaluate-line-model.ts`: PASS.
- Shared Deno tests: 93/93 PASS using a dummy `LINE_CHANNEL_ACCESS_TOKEN` scoped to the Deno process; no real LINE credential was read or used. This includes a transport-level assertion that a send POST receiving HTTP 503 is attempted once and classified as uncertain, so the HTTP client's default policy cannot silently replay it.
- The migration was applied and exercised in an isolated in-memory PGlite 0.5.8 fixture (PostgreSQL 18.3): event claim/duplicate/retryable reclaim/uncertain terminal behavior, history dedup by role/event, image batch event association/claim, RLS, and table/RPC grants passed. The fixture stubbed `cron.schedule` and supplied minimal pre-existing tables. This is useful SQL behavior evidence, but it is not a Supabase local-stack/Postgres validation; production migration remains unapplied.
- Repeatable PGlite coverage is checked in at `scripts/line-webhook-migration.test.ts`; `deno test --allow-read --node-modules-dir=none scripts/line-webhook-migration.test.ts` passed 1/1. Its Promise.all claim case checks the RPC contract through one serialized in-memory engine, not a true multi-session concurrency race.
- Production state remains `line-webhook` v48 ACTIVE, `verify_jwt=false`, text/image rollout `all`; all new idempotency and delivery-outcome code remains local and undeployed.
- A production read-only metadata query returned `to_regclass('public.line_webhook_events') = NULL`, confirming this migration has not been applied there.
- `deno fmt --check` on the 14 touched TypeScript files and `git diff --check`: PASS. The three formatter findings were applied before the passing check.
- `deno lint` on the touched TypeScript set reports 22 diagnostics, all confined to three pre-existing files (`line-image-flow.test.ts`: 19, `line-session-store.test.ts`: 2, `line-webhook/index.ts`: 1); the `HEAD` baseline reported 24. New files and new code paths are lint-clean, so this change introduces no lint findings.

### Remaining local database gate

The migration must still be applied to a clean disposable local Supabase/Postgres database before it is considered deployable. When Docker/local Postgres is available, run `supabase db reset`, `supabase db lint`, and database tests for true two-session concurrent claims; retryable versus terminal/uncertain reclaim; history dedup by event ID; image batch event-ID association/claim; and role access to the new table/RPCs. Then rerun the Edge Function shared suite. Do not use `--linked` or production for this migration validation; no production apply/deploy is authorized here.

## Problem

LINE can redeliver the same webhook event. The text path does not claim `webhookEventId` before AI processing, so duplicate delivery can repeat AI and customer-visible sends. Text and image paths also treat an uncertain reply result as a definite failure and may push the same response again.

## Objective and scope

- Persist an atomic, concurrency-safe idempotency record for text webhook events using `webhookEventId`; duplicates must not rerun AI, mutate chat history, or send another message.
- Distinguish a definite LINE rejection from an ambiguous timeout/network/5xx result. Do not automatically retry or push after an ambiguous send result in either text or image flow. Keep push fallback only after a definite reply rejection.
- Persist a minimal delivery outcome keyed by webhook event ID, without message bodies, tokens, or user PII; keep an ambiguous result available to staff for follow-up.
- Evaluate the exact `deepseek-v4.1-flash:1017-cloud` tag on synthetic KMO agent scenarios, including tool choice and grounded answer checks. Do not send a live customer message.
- Reconcile rollout and model status documentation while preserving the incomplete live E2E evidence as an open gate.

## Constraints / do not touch

- Do not change `internal-proxy`, admin UI, active order/booking data, secrets, or the upstream vendored module source.
- The Phase 5 brief's vendored-module constraint remains applicable; implement send-result classification in project-owned adapters/helpers, not vendored files.
- Do not apply migrations, deploy functions, or use production LINE traffic in this phase. Those actions require a separate Owner go-ahead after local review.
- Existing unrelated working-tree changes, including `bk01-pilot/`, remain untouched.

## Data flow

1. Verify LINE signature, parse events, and atomically claim supported text events by `webhookEventId` before the handler runs.
2. Return without AI/history/send on a completed, ambiguous, or currently-owned duplicate. Release only known pre-send failures for LINE redelivery; never release after an outbound attempt may have reached LINE.
3. Record a write-ahead send-attempt state before calling LINE, then finalize as delivered, definitely rejected, or uncertain. Do not store reply content or credentials.
4. Apply the same reply/push uncertainty policy to image batches; preserve image batching and message-ID dedup behavior.

## Acceptance / verification

- Concurrent and sequential redelivery of one `webhookEventId` claims one AI execution and one outbound attempt; separate event IDs remain independent.
- Pre-send processing failure can be redelivered; a crash/timeout after outbound attempt cannot trigger an automatic second send.
- Reply 4xx rejection may use one push fallback; reply timeout/network/5xx must not push. Push uncertainty is recorded and not repeated.
- Image flow has equivalent typed-result tests for accepted, definite rejection, and ambiguous outcomes.
- Exact model tag eval covers all eight documented scenario categories with tool discipline and grounded-content assertions; record actual results and limitations.
- Deno shared tests, webhook type-check, migration/static checks, and `git diff --check` pass. Live LINE round-trip and Phase 5 image matrix remain explicitly owed until owner-run evidence is available.
- Update PRD, implementation record, project context, model evaluation, and this brief with source/test status; leave the phase open if production gates remain.
