# Codex Independent Review — KMO BK01 Seed Pack Adoption

Date: 2026-09-24
Review mode: READ-ONLY / INDEPENDENT VERIFICATION
Target SHA: `9b236df9aee9dcaae73e4ee9d8218ca37ccf0a0b`

## Verdict

`ADOPTION_PLAN_REMEDIATE`

## Check 1 — Seed Pack coverage: REMEDIATION REQUIRED? No — PASS

Evidence:

- `MANIFEST.md` contains 124 data rows: 52 `EXACT_COPY`, 42 `REFERENCE_DOC`, 26 `INVENTORY_ONLY`, and 4 `ALREADY_PRESENT_IDENTICAL`.
- `IMPORT_MAP.md:9-25` contains 17 concepts; all are represented in the adoption matrix sections A-G.
- Report coverage includes the inventory-only reconciliation row at `REPORT...md:146-147`.
- Independent provenance command verified `94/94` copied/reference blobs.
- `git diff --name-status <parent> <target>` showed only the two assessment documents.
- `git diff --check <parent> <target>` returned no output.

References: `MANIFEST.md:21-146`, `IMPORT_MAP.md:7-25`, `REPORT...md:53-160`.

## Check 2 — Classification against current KMO source: REMEDIATE

Evidence:

- F-1 is confirmed: `dashboard/page.tsx:144-165` resets schedules and snapshots; multiple mutation handlers call `loadDashboardBookings(false)` at `:220`, `:234`, `:251`, `:265`, `:350`, `:377`, `:390`, `:423`, `:436`, `:614`, and `:627`.
- F-2 is confirmed: `book/[slug]/page.tsx:140` derives PromptPay name from shop name/fallback.
- `?? 100` is confirmed at `page.tsx:146` and `:581`.
- Client timer `900` is confirmed at `page.tsx:78` and `:329`.
- Baseline hold RPC returns authoritative `deposit_amount` and `expires_at` at `KMO_BK01_BASELINE.sql:717-727`.
- F-4 is confirmed: `KMO_SCHEMA_CONTRACT.md:26-31,67-70` preserves `public.orders` authority; `supabase/migrations/20260815150000_products_moved_to_booking_project.sql:4-22` defines `public.products`.
- ALREADY_PRESENT equality passed for all four blobs. `git ls-files -s` matched the upstream SHAs listed in `ALREADY_PRESENT.md:7-12`.

Finding:

- F-3 is over-stated. Tickets are excluded from the KMO baseline and pilot product surface (`KMO_SCHEMA_CONTRACT.md:81-86`, `KMO_BASELINE_DEPENDENCY_INVENTORY.md:53-60,100-105`), but the repository still contains ticket tables and RPCs in `supabase/migrations/20260818000000_local_service_tickets.sql:9-45,68-110`.
- The report’s statement that KMO has “no authoritative Claim/Ticket/Case engine” is therefore not sufficiently scoped.

## Check 3 — Protected KMO truth: PASS

Evidence:

- `KMO_SCHEMA_CONTRACT.md:26-41,61-70` preserves KMO ownership of orders, production allocations, identity, and booking boundaries.
- The report preserves weekly schedules, holidays, production capacity, identity bridges, and `public.*` authority at `REPORT...md:149-160`.
- The plan explicitly leaves `public.*` untouched and prohibits Order/Claim runtime activation at `PLAN...md:70-73,163-180`.

## Check 4 — D1A duplication and precedence: PASS

Evidence:

- The report maps D1A A-G to replacement or retained work at `REPORT...md:211-226`.
- It explicitly states that the one-shot plan becomes the single execution worklist, while D1A remains semantic authority for §F.
- The plan repeats the same precedence rule at `PLAN...md:10-14`.
- Commit sequence is explicit at `PLAN...md:138-140`.

## Check 5 — Order/Claim authorization boundaries: PASS

Evidence:

- Claim remains future-gated at `REPORT...md:91-100`.
- Order remains future-gated or contract-conflicted at `REPORT...md:106-115`.
- The plan parks all Order/Claim runtime, routes, tables, RPCs, and capability flags at `PLAN...md:163-180`.
- Conditional Portal work does not expose Order or Claim routes: `PLAN...md:88-93`.

## Check 6 — Plan coherence and executability: PASS

Evidence:

- Source freeze, dedicated worktree, exact base SHA, and copy-then-adapt rules: `PLAN...md:25-30`.
- Slice order and gates: `PLAN...md:32-100`.
- Rollback boundaries: `PLAN...md:156-161`.
- Commit sequence: `PLAN...md:138-140`.
- Merge target is the Domain branch, not `main`: `PLAN...md:132-136`.

## Check 7 — Authority-surface gates: REMEDIATE

Covered:

- Money display and incomplete payment tuple: `PLAN...md:53-56,105-108`.
- Hold expiry: `PLAN...md:56,106-108`.
- Create-hold capacity race: `PLAN...md:70,109`.
- RLS/grants: `PLAN...md:67,73,75,98,110`.
- Tenant isolation: `PLAN...md:112`.
- Booking lifecycle visibility/completion: `PLAN...md:109`.

Missing or insufficiently explicit:

- No dedicated negative tests for unauthorized or illegal lifecycle transitions, despite the lifecycle RPC requiring owner/admin authorization and actor/timestamp recording.
- No explicit reschedule-capacity concurrency, capacity release, or cross-date reschedule proof, although the patch must enforce capacity for both hold creation and reschedule.

No build, test, migration, deploy, or runtime command was run because this review was strictly read-only.

## Findings

1. **File:** `bk01-pilot/docs/REPORT-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md:43-46,97`

   **Defect:** F-3 incorrectly treats the Claim/Ticket/Case engine as absent rather than absent from the KMO baseline/pilot authority.

   **Evidence:** `KMO_SCHEMA_CONTRACT.md:81-86` excludes tickets from the pilot surface, but `supabase/migrations/20260818000000_local_service_tickets.sql:9-45,68-110` defines ticket tables, RLS, and `create_ticket` RPC.

   **Impact:** Future Claim planning could incorrectly create a duplicate Ticket/Case engine or miss an existing migration dependency.

   **Required fix:** Reword F-3 and the adoption matrix to distinguish baseline exclusion, inactive historical migration, and authorized runtime authority. Keep Claim parked until the Owner explicitly decides whether the existing ticket engine is the future adapter target.

2. **File:** `bk01-pilot/docs/PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md:70-75,105-115`

   **Defect:** Lifecycle acceptance does not explicitly test the full transition authority.

   **Evidence:** S3 requires `WAITING_TO_START → IN_PROGRESS → COMPLETED` with authorized actor/timestamp, but S7 only requires the broad D1A scenarios and explicit completion.

   **Impact:** An implementation could pass while allowing unauthorized transitions, illegal state jumps, missing actor attribution, or cross-tenant lifecycle mutation.

   **Required fix:** Add DB-backed positive and negative lifecycle tests for full sequence, invalid transitions, unauthorized actors, outsider/cross-tenant denial, actor/timestamp persistence, and unchanged booking history.

3. **File:** `bk01-pilot/docs/PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md:70,109`

   **Defect:** Capacity proof covers concurrent hold creation but not the reschedule path.

   **Evidence:** S3 requires atomic enforcement in both `create_booking_hold` and reschedule, while S7 only names a concurrent-hold race and the D1A scenarios cover booking creation.

   **Impact:** Rescheduling could exceed capacity or fail to release/reconsume units while all listed gates pass.

   **Required fix:** Add explicit reschedule tests for same-date and cross-date moves, capacity release/reconsumption, concurrent reschedules, and proof that pickup date/duration do not consume intake capacity.

## Reviewer Statement

This was an independent, exact-SHA, read-only review. No source, SQL, documentation, runtime, database, branch, or remote state was modified. The assessment is not ready for adoption until the F-3 scope is corrected and the lifecycle/reschedule authority gates are made explicit.
