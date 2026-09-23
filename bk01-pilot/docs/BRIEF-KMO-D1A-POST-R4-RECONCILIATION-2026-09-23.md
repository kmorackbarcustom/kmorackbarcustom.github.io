# BRIEF — KMO D1A POST-R4 RECONCILIATION

Date: 2026-09-23 (Asia/Bangkok)
Task: `KMO-DOMAIN-BOOKING-READINESS-001`
Stage: `D1A Booking implementation/readiness pass`
Prerequisite: `D0.5_BK01_R4_UPSTREAM_RECONCILIATION = PASS`
Reconciliation report: `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`

## Objective

Implement only the remaining KMO Booking work after removing items already closed by current KMO source or proven BK01 R4. Preserve KMO real-shop truth; do not turn KMO into a BK01 mirror.

## Required source set

Read before editing:
1. `TASK-KMO-DOMAIN-BOOKING-READINESS-001.md`
2. `MASTER-BRIEF-KMO-DOMAIN-TO-D1-2026-09-12.md`
3. `REPORT-BK01-R4-UPSTREAM-FAST-FORWARD-2026-09-23.md`
4. `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md`
5. `BK01_UPSTREAM_FEEDBACK_LEDGER.md`
6. locked KMO schema/extension/bridge contracts and exact current source/tests/migrations.

BK01 references are read-only evidence: source `3b3a333...`, closure `50555c1...`, final docs `5aea758...`.

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

### F. Duration / production boundary — contract-safe only
Do not remove KMO `duration_value/duration_unit` or production-capacity data.
Do not claim true multi-day Booking support from `duration_unit='day'`.
For D1A:
- keep current KMO data compatibility;
- fail closed against impossible same-day booking writes;
- document true multi-day/custom fabrication as unresolved cross-domain capacity work;
- do not redesign Order/Claim/production capacity inside Booking D1A.

### G. Evidence still required
- current owner/admin allow and outsider/cross-tenant deny;
- KMO identity/bridge ambiguity fails closed/manual review;
- notification/provider failure does not corrupt Booking truth;
- customer/admin browser/mobile acceptance on changed surfaces;
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
- KMO production-capacity concepts and existing `public.*` operational authority;
- `public.* / local_service.* / kmo_booking.* / kmo_bridge.*` ownership;
- separate `public.customers` and `local_service.customers`;
- KMO GitHub/Supabase/Cloudflare/secrets/runtime identity.

Prohibited:
- blind merge/cherry-pick of whole BK01 R4 source files;
- canonical BK01 mutation;
- Order or Claim implementation;
- KMO Control implementation;
- universal customer PK;
- broad grants/RLS weakening;
- production mutation/deploy without existing explicit stage authority.

## Builder stop contract

Builder returns one coherent candidate revision plus:
- changed paths and exact SHA;
- tests/checks;
- evidence mapped to A–G;
- unresolved contract conflicts/limitations;
- neutral handoff for fresh Codex independent QA.

No D1A PASS is valid from source tests alone when runtime/browser evidence is required.
