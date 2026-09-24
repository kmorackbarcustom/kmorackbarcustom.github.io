# REPORT — KMO BK01 SEED PACK ADOPTION ASSESSMENT

Date: 2026-09-24 (Asia/Bangkok)
Brief: `BRIEF-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md`
Work type: `READ / CLASSIFY / ADOPTION PLAN` — docs only
Author: Claude (Commander)
Assessment branch: `prep/kmo-bk01-upstream-seed-20260924`
Brief-bearing checkpoint: `d6a3bd4cc2cfce264767bdf6386f6f48e81037f1` (brief source checkpoint `a54bab1`)
Seed Pack target: `73d7651ab302f84d80859d743768b3f13efbf608` (`SEED_PACK_PASS`)

## 0. Reviewed active KMO revision

Active KMO source was compared at the Domain branch `task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control` @ `058fe5211c9eb39d7dda3087ec40b1e896227113`.

`git diff 058fe52 d6a3bd4 -- bk01-pilot/apps bk01-pilot/supabase bk01-pilot/tests bk01-pilot/order` is empty, so the assessment branch and the Domain branch carry byte-identical active source. `bk01-pilot/order/` does not exist in KMO.

Files inspected directly (not inferred from Seed Pack presence):

- `apps/booking-consumer/src/app/book/[slug]/page.tsx`, `src/app/page.tsx`, `src/lib/booking-service.ts`, `src/lib/promptpay.ts`, `src/lib/notification-policy.ts`, `messages/{th,en}.json`
- `apps/booking-admin/src/app/dashboard/page.tsx`, `src/lib/admin-service.ts`, `src/lib/time-input.ts`
- `supabase/kmo-baseline/*.sql` (baseline, weekly-schedule, duration-unit, profile-decouple, hardening patches)
- `tests/*.test.ts`, `package.json`, app `tsconfig.json`
- `KMO_SCHEMA_CONTRACT.md`, `KMO_EXTENSION_DESIGN.md`, `KMO_BASELINE_DEPENDENCY_INVENTORY.md`, D0.5 report, D1A brief, legacy-extraction direction report
- root `supabase/migrations` (KMO live `public.*` domain) for catalog/order ownership

## 1. New findings not captured by D0.5

These change the D1A worklist and are carried into the adoption decision.

### F-1 Background dashboard reload still erases unsaved staff-schedule edits — `MEDIUM`

- File: `apps/booking-admin/src/app/dashboard/page.tsx`
- Evidence: `loadDashboardBookings()` (l.144–174) calls `setSchedules(data.schedules)` and resets `savedScheduleSnapshots`. It is invoked after approve slip (l.220), reject slip (l.234), cancellation (l.251), outcome (l.265), shop settings (l.350), add/remove staff (l.377/390), add/delete holiday (l.423/436), save service (l.614), toggle service (l.627).
- Impact: D0.5 classified "Staff A save erasing Staff B unsaved edits" as `STALE_KMO_FINDING` / regression only. That is true for `handleSaveSchedule` (l.494–545, per-card update, no reload). It is **not** true for every other mutation: any unrelated admin action silently discards all unsaved staff-schedule edits.
- Consequence: BK01 `schedule-merge.ts` (`mergeServerSchedules` with dirty-staff set) is directly applicable and moves from "optional UX" to required.

### F-2 PromptPay account name still derived from shop name — `MEDIUM`

- File: `apps/booking-consumer/src/app/book/[slug]/page.tsx` l.140
- Evidence: `const promptpayName = shop?.promptpay_name || shop?.name || t('fallbackShopName');`
- Impact: D0.5 closed the fake **recipient** fallback, but the customer-facing account **name** is still invented from the shop name or a translation fallback. BK01 R4 `payment-instruction.ts` explicitly forbids this ("NEVER derived from the shop name or any fallback"). This is the same fail-open class as the removed recipient fallback.

### F-3 Claim adapter target does not exist in KMO — `OWNER_DECISION`

- Evidence: BK01 `public-claim.ts` maps into canonical `local_service.create_ticket` / Ticket-Case domain. KMO deliberately excluded `tickets` / `ticket_timeline_entries` (`KMO_SCHEMA_CONTRACT.md` §excluded, `KMO_BASELINE_DEPENDENCY_INVENTORY.md` l.105).
- Impact: Claim cannot be adapted as-is even after authorization; KMO has no authoritative Claim/Ticket/Case engine to sit behind the adapter.

### F-4 BK01 Order domain overlaps live KMO `public.orders` and `public.products` — `OWNER_DECISION`

- Evidence: `KMO_SCHEMA_CONTRACT.md` makes `public.orders` the KMO order/job authority; root migration `20260815150000_products_moved_to_booking_project.sql` defines KMO `public.products` (live catalog). BK01 Order scaffold introduces its own lifecycle (`DRAFT→…→COMPLETED`), catalog module (`order/catalog`, vendored from modules-hub) and Order→Booking delegation only at `READY` with `ON_SITE_SERVICE`.
- Impact: the brief's direction "BK01 Order domain model + KMO production-capacity authority" leaves unresolved which record owns KMO order/job truth and whether KMO's Booking→job direction or BK01's Order→Booking direction is canonical.

## 2. Adoption matrix

Paths below are relative to `bk01-pilot/reference/bk01-upstream-seed-2026-09-24/` unless prefixed `apps/`, `tests/`, `supabase/` (active KMO).

### A. Booking R4 helpers

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Truthful page-state resolver | `3b3a333` `booking-r4/consumer/src/lib/booking-state.ts` | Inline in `book/[slug]/page.tsx`: has `LOAD_ERROR` and not-found only; `is_accepting_online_bookings=false` short-circuits to stepper; no `NO_SERVICES/NO_STAFF/NO_SCHEDULE/PAYMENT_NOT_CONFIGURED` | ADAPT_FOR_KMO | LOW | `scheduleCount` must mean "at least one open `shop_weekly_schedules` day AND one staff working day inside it"; add per-date `NO_SLOT_FOR_DATE` at step 2 (not a page state); keep KMO contact-phone fallback copy | Yes — D1A B | Payment-instruction adaptation (for `everyServicePaymentBlocked`) | Same defect class D0.5 recorded as `SYNC_FROM_BK01`; resolver is pure and small |
| Resolver tests | `3b3a333` `booking-r4/tests/booking-state.test.ts` | none | ADAPT_FOR_KMO | LOW | add KMO weekly-schedule cases | Yes | resolver | Test contract travels with helper |
| Load-result truth | `3b3a333` `booking-r4/consumer/src/lib/load-result.ts` | `booking-service.ts` already throws on every read error (`SHOP_READ_FAILED`, `SERVICES_READ_FAILED`, `STAFF_READ_FAILED`, schedule/weekly/holiday errors); `null`/`[]` only after success | ALREADY_PRESENT | LOW | none; helper extraction optional, not a work item | n/a | none | Behavior equivalent; do not schedule duplicate work |
| Load-result tests | `3b3a333` `booking-r4/tests/load-result.test.ts` | no KMO test asserts read-error → `LOAD_ERROR` (`tests/public-contract.test.ts` checks selected columns, not error paths) | ADAPT_FOR_KMO | LOW | add a KMO test that each `booking-service.ts` reader throws on query error and returns `null`/`[]` only on success; test-only, no helper extraction required | Yes — D1A G evidence | none | Behavior exists but is unproven by test |
| Payment instruction gate | `3b3a333` `booking-r4/consumer/src/lib/payment-instruction.ts` | `promptpay.ts` has same EMVCo encoder (throws on invalid recipient); page shows amount from `selectedService.deposit_amount ?? shop.default_deposit_amount ?? 100` (l.146, l.581); name derived from shop name (F-2); static-QR branch via `NEXT_PUBLIC_KMO_STATIC_PROMPTPAY_QR_URL` (validated `/` or `https://`) | ADAPT_FOR_KMO | HIGH | Take gate verbatim for dynamic QR; add KMO static-QR branch: allowed only when static URL is configured AND `shop.promptpay_name` is configured AND `holdResult.deposit_amount` is authoritative (>0); remove `?? 100` and name fallback; keep `promptpay.ts` as a re-export of the single encoder owner | Yes — D1A C | hold RPC already returns `deposit_amount`, `expires_at` (`KMO_BK01_BASELINE.sql` l.723–725) | Money-display authority; KMO static QR must be preserved per brief |
| Payment instruction tests | `3b3a333` `booking-r4/tests/payment-instruction.test.ts` | `tests/promptpay.test.ts` (encoder only) | ADAPT_FOR_KMO | MEDIUM | add static-QR fail-closed cases (no QR/copy/download/slip when tuple incomplete) | Yes | gate | D1A C regression requirement |
| Hold countdown authority | concept in R4 consumer page (`3b3a333`) | client `useState(900)` + `setTimeLeft(900)` (l.78, l.329) | ADAPT_FOR_KMO | MEDIUM | derive remaining seconds from `holdResult.expires_at`; expired → hold-expired state | Yes — D1A C | none (server already returns `expires_at`) | D0.5 `SYNC_FROM_BK01` |
| Admin readiness model | `3b3a333` `booking-r4/admin/src/lib/readiness.ts` | no readiness surface in `dashboard/page.tsx` | ADAPT_FOR_KMO | MEDIUM | extend keys: `shop_weekly_schedule`, `staff_schedule_inside_shop_hours`, `special_holidays` (informational), `payment` (incl. static-QR rule), `line`, `public_booking` (source: `shop_public_profile.is_accepting_online_bookings`; KMO is Stripe-free so no billing input), `intake_capacity` (after D1A F2); `order`, `claim`, `production_capacity` rows shown as explicit `not_authorized` / `kmo_owned`, never `ready` | **New** — not in D1A; Booking-scope, no Order/Claim activation | F2 capacity setting for its row | Readiness is how the shop sees fail-closed states it caused; complements D1A B |
| Readiness tests | `3b3a333` `booking-r4/tests/readiness.test.ts` | none | ADAPT_FOR_KMO | LOW | KMO keys | with readiness | — | — |
| Schedule dirty-state merge | `3b3a333` `booking-r4/admin/src/lib/schedule-merge.ts` | per-card save + rollback exists (l.494–545); every other mutation reload wipes unsaved edits (F-1) | USE_AS_IS | LOW | wire into `loadDashboardBookings` and initial load; keep snapshots for non-dirty staff only | Yes — D1A E | dirty-set state | Helper is generic and semantically correct for KMO; fixes F-1 |
| Schedule-merge tests | `3b3a333` `booking-r4/tests/schedule-merge.test.ts` | none | USE_AS_IS | LOW | — | Yes | — | Pure test of pure helper |
| Dirty marker / save-all / leave guard | R4 admin page concept (`3b3a333`) | absent | ADAPT_FOR_KMO | MEDIUM | save-all must run per-card saves and apply KMO per-card rollback on each failure; leave guard via `beforeunload` when dirty set non-empty | Yes — D1A E | merge helper | D0.5 `SYNC_FROM_BK01`; must not replace KMO rollback |
| Staff failed-save rollback | KMO only | present | PRESERVE_KMO_OVER_UPSTREAM | LOW | none | n/a | — | D0.5 `KMO_AHEAD` |
| Strict HH:MM grammar | KMO `time-input.ts` | present | PRESERVE_KMO_OVER_UPSTREAM | LOW | none | n/a | — | D0.5 `KMO_AHEAD` |

### B. Public Portal

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Capability resolver + card selection | `45fa3ab` `public-portal-claim/source/booking-consumer/src/lib/public-portal.ts` | none; `/` redirects to `/book/<NEXT_PUBLIC_DEFAULT_SHOP_SLUG>` | ADAPT_FOR_KMO | MEDIUM | keep strict `=== true`; KMO production source supplies `bookingEnabled` from `shop_public_profile`; `orderEnabled`/`claimEnabled` hard-wired `false` (no source field at all) until their gates open | **No** — needs OD-1 | OD-1 | Correct fail-closed model; activation changes customer entry |
| `/shop/[slug]` portal page | `45fa3ab` `.../app/shop/[slug]/page.tsx` | none | ADAPT_FOR_KMO | MEDIUM | KMO styling/i18n; render only enabled cards; disabled capability renders no link and no route | No — OD-1 | resolver | Same |
| Disabled-capability behavior | `45fa3ab` resolver + page | n/a | USE_AS_IS | LOW | — | with portal | — | "No dead intake route" is exactly the brief rule |
| Portal i18n | `45fa3ab` `.../messages/{th,en}.json` key `portal` | KMO messages have identical top-level keys except upstream adds `portal`, `claim` | ADAPT_FOR_KMO | LOW | merge `portal` key only; `claim` key deferred with Claim | No — OD-1 | portal page | Do not overwrite active KMO messages |
| Portal tests | `45fa3ab` `public-portal-claim/tests/public-portal-claim.test.ts` (portal cases) | none | ADAPT_FOR_KMO | LOW | split portal cases from claim cases | with portal | — | — |
| Canonical KMO customer entry | concept | `/` → `/book/<slug>` | ADAPT_FOR_KMO | OWNER_DECISION | if OD-1 = yes: `/` → `/shop/<slug>`; `/book/[slug]` stays the Booking destination (existing LINE/deep links keep working); `/manage-booking` unchanged; no `/order/*`, `/shop/*/claim`, `/claim/track` routes created until their gates | No — OD-1 | OD-1 | Recommended target, but it changes the public entry and is not in D1A authority |

### C. Claim

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Public Claim contract (categories, input, validation) | `45fa3ab` `.../lib/public-claim.ts` | none | FUTURE_AUTHORIZATION_REQUIRED | HIGH | re-map categories to KMO engine once chosen | No | OD-2 | Claim `NOT_AUTHORIZED_YET` |
| Booking→Claim / Order→Claim / standalone origin | `45fa3ab` `public-claim.ts` `ClaimOrigin`, `claim-entry-point.tsx` | none | FUTURE_AUTHORIZATION_REQUIRED | MEDIUM | Order origin also waits on OD-3 | No | OD-2, OD-3 | — |
| Opaque tracking token, no UUID/phone authority | `45fa3ab` `public-claim.ts` | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | none conceptually | No | OD-2 | Keep as mandatory security rule for future Claim |
| Forbidden internal-field stripping | `45fa3ab` `CUSTOMER_FORBIDDEN_TICKET_FIELDS` | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | field list depends on engine | No | OD-2 | — |
| Idempotency key on submission | `45fa3ab` | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | — | No | OD-2 | — |
| Public status projection (`received, in_review, waiting_for_you, resolved, closed`) | `45fa3ab` `toPublicClaimStatus`, `projectPublicClaimTracking` | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | mapping from KMO engine statuses | No | OD-2 | — |
| Ticket/Case adapter boundary | `45fa3ab` `PublicClaimAdapter` → `local_service.create_ticket` | KMO excluded tickets (F-3) | CONTRACT_CONFLICT | OWNER_DECISION | choose KMO authoritative Claim engine before any adapter | No | OD-2 | No engine behind the adapter |
| Claim intake / tracking pages | `45fa3ab` `.../shop/[slug]/claim/page.tsx`, `.../claim/track/page.tsx` | none | FUTURE_AUTHORIZATION_REQUIRED | MEDIUM | — | No | OD-2 | Must not be routed |
| Fail-closed production adapter | `45fa3ab` `productionClaimAdapter` (`CLAIM_RUNTIME_NOT_ENABLED`) | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | — | No | OD-2 | Pattern reused for KMO when authorized |
| Claim docs (threat model, evidence, runtime handoff, portal/claim decision) | `45fa3ab` `public-portal-claim/docs/*` | n/a | REFERENCE_ONLY | LOW | — | n/a | — | Design/threat evidence |

### D. Order safe scaffold

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Order lifecycle / payment / deposit state machines | `9821881` `order-safe-scaffold/source/order/core/index.ts` | live `public.orders` is KMO order/job authority | CONTRACT_CONFLICT | OWNER_DECISION | decide whether BK01 lifecycle models `public.orders` or a new domain | No | OD-3 | F-4 |
| Immutable line snapshot + integer money (satang) | `9821881` `createOrderLineSnapshot` | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | — | No | OD-3 | Sound pattern; Order not authorized |
| Lead time / requested-date truth / over-capacity rejection | `9821881` `calculateOrderRequirements`, `calculateEarliestReadyDate` | KMO production timing lives in `public.production_allocations` | PRESERVE_KMO_OVER_UPSTREAM | HIGH | none — KMO computes ready date from its own production load | n/a | — | Brief §7: never import BK01 generic capacity as authority |
| Generic capacity calendar / reservation | `9821881` `materializeCapacityDays`, `decideSequentialReservation`, `decideCancellationCapacityRelease` | KMO production capacity is `public.production_allocations` | PRESERVE_KMO_OVER_UPSTREAM | HIGH | none | n/a | — | Same. Note: the *pattern* (weekly rule + override + reserved ≤ capacity) is `REFERENCE_ONLY` input to D1A F2 **intake** units design; enforcement must be atomic SQL, not this TS |
| Order→Booking delegation (`READY` + `ON_SITE_SERVICE`) | `9821881` `order/core/booking-link.ts`, `canCreateBookingForOrder` | KMO flow is Booking intake → job/production | CONTRACT_CONFLICT | OWNER_DECISION | direction and trigger must be decided | No | OD-3 | F-4 |
| Opaque tracking token / public projection / idempotency / shop-scoped ports / cross-shop reject | `9821881` `order/core/security.ts`, repository/port interfaces | n/a | FUTURE_AUTHORIZATION_REQUIRED | LOW | — | No | OD-3 | Order `NOT_AUTHORIZED_YET` |
| Order consumer/admin runtime stubs | `9821881` `order-runtime.ts`, `order-admin-contract.ts`, `order/[slug]/page.tsx`, `dashboard/orders/page.tsx` | none | FUTURE_AUTHORIZATION_REQUIRED | MEDIUM | — | No | OD-3 | Must not be routed |
| Order domain tests | `9821881` `order-safe-scaffold/tests/order-domain.test.ts` | none | FUTURE_AUTHORIZATION_REQUIRED | LOW | — | No | OD-3 | — |
| Product catalog module | `9821881` `order-safe-scaffold/source/order/catalog/**`, `catalog-adaptation.ts`, `CATALOG_PROVENANCE.md` | KMO live `public.products` + admin products flow | REJECT_FOR_KMO | LOW | — | n/a | — | KMO already owns a live catalog; a second catalog module would split truth |
| Catalog package/build manifests | `9821881` `order/catalog/{package.json,package-lock.json,tsconfig.json,vitest.config.ts}` (INVENTORY_ONLY) | — | REJECT_FOR_KMO | LOW | — | n/a | — | Follows catalog decision |
| Order design/contract docs (`00`…`04`, contracts, probes, evidence, handoffs) | `9821881` `order-safe-scaffold/docs/*` | — | REFERENCE_ONLY | LOW | — | n/a | — | Input to OD-3 |

### E. Already-present capabilities

Re-verified at `058fe52`: blobs of `manage-booking/page.tsx` (`09dcfa5…`), `api/deposit-slips/upload-intent/route.ts` (`d764bb6…`), `lib/notification-policy.ts` (`4d86505…`), `tests/notification-policy.test.ts` (`fa159d7…`) equal BK01 R4.

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Customer cancel/reschedule | `3b3a333` `manage-booking/page.tsx` | identical blob | ALREADY_PRESENT | LOW | none | n/a | — | No drift |
| Recovery-token booking management | same | identical | ALREADY_PRESENT | LOW | none | n/a | — | — |
| Private deposit-slip upload | `3b3a333` `upload-intent/route.ts` | identical | ALREADY_PRESENT | LOW | none | n/a | — | — |
| Notification retry / backoff / cap | `3b3a333` `notification-policy.ts` + test | identical | ALREADY_PRESENT | LOW | none | n/a | — | — |
| Reminder suppression after cancel | same | identical | ALREADY_PRESENT | LOW | none | n/a | — | — |
| Notification failure separated from Booking truth | same | identical code; runtime proof still owed (D1A G) | ALREADY_PRESENT | LOW | evidence only | n/a | — | Code present; proof stays in D1A G |

### F. Proof / evidence harness

Methodology is adopted as KMO verification standard; the upstream evidence files themselves stay reference.

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Truthful-state matrix | `50555c1` `booking-r4/evidence/EVIDENCE-consumer-state-matrix-*.json` | no KMO equivalent | ADAPT_FOR_KMO | LOW | KMO state list incl. `NO_SLOT_FOR_DATE`, hold-expired, payment-not-configured (static + dynamic) | Yes — D1A G | slices S1–S2 | Standard verification |
| Admin acceptance matrix (auth + unauth) | `50555c1` `EVIDENCE-admin-*.json` | partial prior mobile review | ADAPT_FOR_KMO | LOW | add readiness, dirty/save-all, work dashboard | Yes | S4 | — |
| Desktop + mobile proof | `50555c1` report + PNG inventory | prior mobile pilot review | ADAPT_FOR_KMO | LOW | 360/390 px + desktop on every changed surface | Yes | — | — |
| Positive Booking E2E | `50555c1` `EVIDENCE-positive-e2e-browser`, `-e2e-booking-db-state` | none current | ADAPT_FOR_KMO | MEDIUM | KMO intake-units + work lifecycle path | Yes | S3 | — |
| Cross-tenant isolation / rapid tenant navigation | `50555c1` `EVIDENCE-crosscut-*` | owed (D1A G) | ADAPT_FOR_KMO | MEDIUM | KMO owner/admin allow + outsider deny | Yes | — | — |
| Temporary isolated fixtures + residue-zero cleanup | `50555c1` `EVIDENCE-fixture-*` | none | ADAPT_FOR_KMO | MEDIUM | fixture shop in KMO project, never real KMO shop rows | Yes | — | Protects live KMO data |
| Before/after KMO business-data fingerprint | `50555c1` `EVIDENCE-kmo-unmodified-fingerprint` | none | ADAPT_FOR_KMO | HIGH | fingerprint `public.bookings`, `public.orders`, `public.production_allocations`, `public.customers` + KMO `local_service` shop rows | Yes | — | Required because proof runs against the KMO project |
| External side-effect suppression | R4 closure report | none | ADAPT_FOR_KMO | MEDIUM | LINE/Telegram/notification dispatch disabled or sandboxed during proof | Yes | — | — |
| Predicate-grant before/after evidence + repair SQL | `50555c1` `EVIDENCE-kmo-predicate-grant-*`, `KMO-REPAIR-...sql` (INVENTORY_ONLY) | runtime has grant; baseline SQL lacks it | ADAPT_FOR_KMO | MEDIUM | encode exact `GRANT SELECT (shop_id)` on `staff_schedules`, `shop_holidays` in KMO baseline patch + rollback | Yes — D1A A | — | D0.5 `SYNC_FROM_BK01` |
| R4 closure / resume reports, index, durations, R4.x proofs | `50555c1` remaining evidence | — | REFERENCE_ONLY | LOW | — | n/a | — | Methodology source |
| BK01 doc reconciliation commit | `5aea758` (INVENTORY_ONLY) | — | REFERENCE_ONLY | LOW | — | n/a | — | Docs-only baseline |

### G. KMO authority (protected)

| Item / Concept | Upstream ref/path | Current KMO state | Disposition | Risk | KMO adaptation required | Authorization now? | Dependencies | Reason |
|---|---|---|---|---|---|---|---|---|
| Shop weekly schedule | none upstream | `shop_weekly_schedules` + trigger (fail-open on missing row — D1A D) | PRESERVE_KMO_OVER_UPSTREAM | MEDIUM | fix fail-open (D1A D) | Yes — D1A D | — | KMO stronger truth |
| Shop + staff holidays precedence | — | KMO only | PRESERVE_KMO_OVER_UPSTREAM | LOW | re-prove | Yes | — | — |
| Production capacity / `public.production_allocations` | BK01 generic capacity | KMO only | PRESERVE_KMO_OVER_UPSTREAM | HIGH | none | n/a | — | Brief §3 |
| Intake-calendar / work-lifecycle separation | none upstream | legacy `booking.html` / `bookingdashboard.html` behavior | PRESERVE_KMO_OVER_UPSTREAM | HIGH | rebuild per D1A F | Yes — D1A F | — | KMO real-shop model |
| Identity/bridge, `public.customers` vs `local_service.customers` | — | KMO only | PRESERVE_KMO_OVER_UPSTREAM | HIGH | none | n/a | — | No universal PK |
| Profile/payment decoupling | — | KMO ahead | PRESERVE_KMO_OVER_UPSTREAM | LOW | regression only | n/a | — | D0.5 |
| KMO LINE / notification runtime, KMO infra identity | — | KMO only | PRESERVE_KMO_OVER_UPSTREAM | MEDIUM | none | n/a | — | Brief §3 |
| Service `duration_unit='day'` | BK01 minute durations | KMO keeps day unit; online booking rejects day | CONTRACT_CONFLICT | MEDIUM | resolved in practice by D1A F (intake-date semantics); must not be read as multi-day slot support | Yes via D1A F | — | D0.5 conflict #1 stays documented |

## 3. Summary outputs

### USE NOW
- `schedule-merge.ts` + its test (fixes F-1).
- Portal disabled-capability rule (only when portal is built).

### ADAPT
- Booking state resolver (+ KMO weekly-schedule meaning, `NO_SLOT_FOR_DATE`).
- Payment instruction gate (+ KMO static-QR branch, removal of `?? 100` and shop-name fallback — F-2).
- Server-authoritative hold countdown from `expires_at`.
- Admin readiness model (KMO keys; Order/Claim/production shown as not-authorized / KMO-owned).
- Dirty marker / save-all / leave guard on top of KMO per-card rollback.
- Public Portal resolver/page/i18n — gated by OD-1.
- R4 proof methodology as KMO verification standard; predicate-grant source reconciliation.

### ALREADY PRESENT
- Load-result truth (behavior).
- Manage-booking (cancel/reschedule, recovery token), private slip upload, notification retry/backoff/cap, reminder suppression, notification/Booking separation.

### PRESERVE KMO
- Shop weekly schedule, holidays precedence, intake/work separation, production capacity, identity/bridge, profile/payment decoupling, strict time grammar, failed-card rollback, LINE/notification runtime, infra identity, BK01 capacity calendar never authoritative.

### REJECT
- BK01 `order/catalog` module, `catalog-adaptation.ts` and its package/build manifests (KMO `public.products` is the catalog).

### FUTURE GATED
- All Claim contract/UI/adapter/token/projection/idempotency items.
- Order line snapshot, integer money, tracking token, projection, idempotency, shop-scoped ports, runtime stubs, Order tests.

### CONTRACT CONFLICTS
- **OD-1** Public Portal as canonical customer entry (changes `/` behavior) — in or out of the one-shot package.
- **OD-2** KMO authoritative Claim/Ticket/Case engine (tickets excluded from KMO) — F-3.
- **OD-3** BK01 Order domain vs live `public.orders` / `public.products`, and Booking→job vs Order→Booking direction — F-4.
- `duration_unit='day'` semantics — technical, handled by D1A F; no Owner decision needed unless F is rejected.

## 4. One-shot integration decision

**`ONE_SHOT_INTEGRATION_FEASIBLE_WITH_GATES`**

Technical reason:

1. Every Booking-scope item that is `USE_AS_IS` / `ADAPT_FOR_KMO` touches the same small active surface — `book/[slug]/page.tsx`, `dashboard/page.tsx`, a few new pure `lib/*.ts` helpers, `tests/*.test.ts`, messages, and `supabase/kmo-baseline/*` patch files — and overlaps D1A A–G almost completely. Splitting them into D1A plus a separate Seed-adoption stream would edit the same two page files twice and double the browser/runtime proof.
2. None of those items depends on Order or Claim. The Order/Claim material is either future-gated or blocked on OD-2/OD-3, so it cleanly stays out of the package without leaving half-built surfaces.
3. The gates are: OD-1 decides whether the Portal slice is in the package; the DB slice must pass a Codex SQL/RLS review before any runtime apply; production apply/deploy stays under existing stage authority.

The master plan is `PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md`.

## 5. Relationship to current D1A

| D1A item | Relationship |
|---|---|
| A. Source/runtime privilege parity | Remains required; executed inside plan S3 using R4 predicate-grant evidence pattern |
| B. Customer truthful-state parity | **Replaced** by Seed adoption of `booking-state.ts` (plan S1–S2) |
| C. Payment and hold authority | **Replaced** by Seed adoption of `payment-instruction.ts` + countdown (plan S1–S2), plus F-2 name-fallback removal |
| D. Shop-weekly fail-closed invariant | Remains independently required (KMO-only); plan S3 |
| E. Staff schedule integrity | DB part remains independent (S3); UX part **replaced** by `schedule-merge.ts` + dirty/save-all (S4), plus F-1 |
| F. Intake-calendar / work-lifecycle separation | Remains independently required (KMO-only); plan S3 + S4; BK01 capacity-calendar pattern is reference input only |
| G. Evidence | Remains required; methodology upgraded to the R4 proof harness (plan S7) |
| Regression-only list | Stays regression-only **except** "Staff A save erasing Staff B edits", which is reopened by F-1 for the non-save reload paths |

Seed items that add work not in D1A: admin readiness model; Public Portal (gated by OD-1); F-1; F-2; R4 fixture/fingerprint/side-effect-suppression harness.

Stale D1A items to delete as separate cards: none beyond D0.5's list; D1A B and C and the UX half of E stop existing as separate cards once the plan is accepted.

Precedence rule: once `KMO_BK01_ONE_SHOT_INTEGRATION_PLAN = READY`, the plan **sits above** the D1A brief as the single execution worklist. The D1A brief remains the authority for the *semantics* of §F (intake/work contract) and its eight regression scenarios, which the plan imports by reference. The D1A brief is not dispatched separately. Where the two disagree on scope or sequencing, the plan wins; where they disagree on §F semantics, D1A wins. This rule takes effect only when the plan is accepted.

## 6. Prohibitions honored in this round

No change to `bk01-pilot/apps/**`, `supabase/**`, `order/**`, `tests/**`; no migration, runtime, deploy, merge, activation, canonical BK01 change or new Owner decision. OD-1…OD-3 are listed as open questions, not decided.

## 7. Markers (pending review)

Proposed on Codex `ADOPTION_PLAN_PASS`:

- `KMO_BK01_SEED_PACK_ADOPTION_DECISION = LOCKED`
- `KMO_BK01_ONE_SHOT_INTEGRATION_PLAN = READY`

Planning state only. No production mutation, merge, deploy, Order or Claim activation is authorized.
