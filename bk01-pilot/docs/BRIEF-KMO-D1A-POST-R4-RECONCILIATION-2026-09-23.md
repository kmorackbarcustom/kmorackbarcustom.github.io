# BRIEF — KMO D1A POST-R4 RECONCILIATION

Date: 2026-09-23 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Stage: `D1A Booking implementation/readiness pass`
Prerequisite: `D0.5_BK01_R4_UPSTREAM_RECONCILIATION = PASS`
Reconciliation report: `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`
KMO legacy-extraction direction: `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`

## Objective

Implement the remaining KMO Booking work after removing items already closed by current KMO source or proven BK01 R4, while restoring the proven KMO operational distinction between customer intake scheduling and long-running workshop work.

Preserve KMO real-shop truth; do not turn KMO into a BK01 mirror.

## Required source set

Read before editing:
1. `TASK-KMO-DOMAIN-BOOKING-READINESS-001.md`
2. `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`
3. `MASTER-BRIEF-KMO-DOMAIN-TO-D1-2026-09-12.md`
4. `REPORT-BK01-R4-UPSTREAM-FAST-FORWARD-2026-09-23.md`
5. `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`
6. `BK01_UPSTREAM_FEEDBACK_LEDGER.md`
7. locked KMO schema/extension/bridge contracts and exact current source/tests/migrations.
8. root legacy KMO `booking.html` and `bookingdashboard.html` as behavioral evidence only, never as code to copy wholesale.

BK01 references are read-only evidence: source `3b3a333...`, closure `50555c1...`, final docs `5aea758...`. Canonical BK01 remains frozen under Owner Hold.

## Reduced D1A implementation worklist

### A. Source/runtime privilege parity — required
Reconcile KMO baseline/migration source with the already-proven runtime repair:
- anon SELECT only on `staff_schedules.shop_id`;
- anon SELECT only on `shop_holidays.shop_id`;
- preserve current RLS/policies;
- no table-wide SELECT and no write privilege;
- add exact regression/verification evidence.

### B. Customer truthful-state parity — required
Adapt BK01 R4 state separation into KMO:
- `SHOP_NOT_FOUND` != `LOAD_ERROR`;
- explicit `NO_SERVICES`, `NO_STAFF`, `NO_SCHEDULE`, `NO_SLOT_FOR_DATE`;
- payment-not-configured fail-closed state where payment is required;
- preserve KMO shop-weekly availability inputs and customer contact fallback.

Do not replace KMO availability logic with upstream's simpler model.

### C. Payment and hold authority — required
- remove client-invented/fallback amount authority including `?? 100`;
- use hold/server state for authoritative payable deposit;
- preserve KMO static QR support only when its provenance is configured and safe;
- do not invent PromptPay recipient or merchant name;
- countdown derives from server `expires_at`, not independent `900`;
- regression-test no-QR/no-copy/no-download when payment authority is incomplete.

### D. Shop-weekly fail-closed invariant — required
KMO owns the weekly model. Close the current missing-row failure:
- missing required weekly row must fail closed or be made impossible by an atomic seven-row invariant;
- create and reschedule must enforce recurring closure/hours;
- special shop holiday and staff holiday remain independent higher-priority blockers;
- DB-backed negative tests required.

### E. Staff schedule integrity — required
- DB/RPC must reject staff working hours outside authoritative shop hours where the KMO contract requires it;
- retain KMO failed-card rollback semantics;
- adapt BK01 dirty marker/save-all/leave-guard concepts only if they preserve rollback and tenant authority;
- prove Staff A save/failure cannot corrupt Staff B unsaved state.

### F. KMO intake-calendar / work-lifecycle separation — authorized and required

This section supersedes the prior D1A limitation that day-based/custom work may only be documented.

Use the behavioral contract from `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md`.

#### F1. Public Booking calendar

The public/customer Booking calendar answers only:

> Which date can a new customer/job enter the shop?

A booking consumes intake capacity on `appointment_date` only.

`pickup_date`, estimated work duration, and unfinished work after the appointment date must not automatically block later public Booking dates.

#### F2. Configurable daily intake capacity

Do not keep legacy `DAILY_CAP = 3` as a constant.

The KMO target must support a shop-configured daily intake capacity measured in integer units.

A booking must be capable of consuming more than one intake unit on its `appointment_date`.

Capacity enforcement must be atomic/server-authoritative at write time. UI/calendar checks are advisory only.

#### F3. Operational work lifecycle

Long-running work must persist separately from public intake availability.

At minimum preserve these semantics:

```text
WAITING_TO_START
IN_PROGRESS
COMPLETED
```

A future refinement may introduce `CHECKED_IN` and `READY_FOR_PICKUP`, but D1A must not collapse KMO work back to only `confirmed -> completed`.

Completion must require an explicit authorized shop action/event.

#### F4. Due-today and overdue behavior

A confirmed booking reaching `appointment_date` must remain visible and actionable.

The shop must be able to deterministically identify:
- due today;
- past appointment date but not started/completed;
- in progress;
- completed;
- no-show/cancel/reschedule where authorized.

A record must not disappear because the appointment date has passed.

#### F5. Pickup/work duration

`pickup_date` and estimated work duration are operational milestones.

They may drive:
- expected completion communication;
- pickup planning;
- reminders;
- overdue visibility.

They must not be reused as a public multi-day capacity lock.

#### F6. Scope boundary

This authorizes KMO Booking intake/work separation only.

It does NOT authorize:
- Order implementation;
- Claim implementation;
- KMO Control implementation;
- a generic Booking+Order+Claim capacity engine;
- canonical BK01 changes.

### G. Evidence still required
- current owner/admin allow and outsider/cross-tenant deny;
- KMO identity/bridge ambiguity fails closed/manual review;
- notification/provider failure does not corrupt Booking truth;
- customer/admin browser/mobile acceptance on changed surfaces;
- atomic intake-capacity race/concurrency proof;
- long-running booking does not block unrelated future intake dates;
- explicit operational progression remains visible until completion;
- tests, lint, typecheck/build, diff check, allowed-path audit and exact-value generated-artifact secret scan.

## Regression-only items — no implementation card
Do not spend D1A build time re-solving:
- Services/Staff browser `is_active` filtering;
- fake PromptPay recipient fallback;
- numeric forced-zero editing;
- Staff A save erasing Staff B edits;
- profile save requiring PromptPay.

Re-run focused regression evidence only.

## Preserve / prohibited

Preserve:
- KMO shop weekly schedule and special-holiday truth;
- KMO legacy appointment-date-only intake semantics as rebuilt under current security boundaries;
- KMO production/work-progress concepts and existing `public.*` operational authority where current contracts permit;
- `public.* / local_service.* / kmo_booking.* / kmo_bridge.*` ownership;
- separate `public.customers` and `local_service.customers`;
- KMO GitHub/Supabase/Cloudflare/secrets/runtime identity.

Prohibited:
- blind merge/cherry-pick of whole BK01 R4 source files;
- blind restoration/copy of legacy `booking.html` or `bookingdashboard.html`;
- canonical BK01 mutation;
- Order or Claim implementation;
- generic cross-domain production-capacity redesign;
- KMO Control implementation;
- universal customer PK;
- broad grants/RLS weakening;
- production mutation/deploy without existing explicit stage authority.

## Required KMO regression scenarios

D1A must prove at least:

1. a booking with Monday appointment and Friday pickup consumes Monday intake only;
2. Tuesday-Friday remain bookable when their own intake capacity is available;
3. a long-running one-month job does not block the following month of public intake dates;
4. a booking consuming all configured intake units makes only its appointment date full;
5. multiple smaller bookings can share an appointment date until the unit limit is reached;
6. concurrent attempts cannot exceed the authoritative daily intake-unit limit;
7. after appointment day, unfinished work remains in the operational dashboard;
8. explicit completion closes the work lifecycle without retroactively changing historical booking truth.

## Builder stop contract

Builder returns one coherent candidate revision plus:
- changed paths and exact SHA;
- tests/checks;
- evidence mapped to A–G and the required KMO regression scenarios;
- unresolved contract conflicts/limitations;
- neutral handoff for fresh Codex independent QA.

No D1A PASS is valid from source tests alone when runtime/browser evidence is required.
