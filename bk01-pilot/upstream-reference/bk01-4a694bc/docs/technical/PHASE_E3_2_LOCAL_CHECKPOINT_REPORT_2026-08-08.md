# Phase E3.2 Local Checkpoint Report

Date: 2026-08-08  
Scope: Staff schedules and shop-wide holidays  
Status: Local implementation complete; migration not applied to live Supabase

## Implemented

- Added a migration that revokes direct authenticated writes to `staff_schedules` and `shop_holidays`.
- Added authenticated-only, role-aware RPCs for:
  - atomically upserting all seven schedule days for one staff member;
  - creating a shop-wide holiday with an idempotency key;
  - deleting a shop-wide holiday.
- RPC authorization is limited to owner/admin and derives the target shop from the staff/holiday row for mutation operations.
- Added validation for seven unique weekdays, working hours, and optional break-time pairs.
- Added a partial unique index that prevents duplicate shop-wide holidays on the same date.
- Replaced dashboard schedule and holiday mocks with reads from the real Supabase tables.
- Preserved the compact three-column staff-card layout while allowing per-day editing and atomic weekly save.
- Removed the unsupported shop-wide recurring hours/off-day state because there is no matching backend source of truth.
- Staff-role users are read-only. Staff self-service remains deferred until an authenticated user can be mapped to a concrete `staff.id`.

## Local verification

- `npm --workspace apps/booking-admin run build`: passed with zero TypeScript errors.
- Targeted ESLint for the two changed TypeScript files: zero errors; one pre-existing `no-img-element` warning remains in the dashboard.
- `git diff --check`: passed; only Windows line-ending notices were emitted.
- Mock-reference scan: no `INITIAL_SCHEDULES`, mock shop hours, mock weekly shop off-days, or local holiday mutation remains.
- Full admin lint still fails on three pre-existing `no-explicit-any` errors outside this checkpoint (`api/line/webhook` and `platform-admin`).

## Not performed at this checkpoint

- The migration was not applied to local or live Supabase.
- No REST role-matrix, cross-tenant, idempotency, or browser verification was run.
- No test data was created.
- No files were staged, committed, or pushed.

## Required live verification checkpoint

1. Confirm existing shop-wide holidays contain no duplicate `(shop_id, holiday_date)` rows before applying the partial unique index.
2. Apply the migration.
3. Verify anon RPC denial and direct-table-write denial.
4. Verify owner/admin success, staff denial, and cross-tenant denial.
5. Verify seven-day/duplicate-day/time/break validation and holiday idempotency.
6. Verify in a real browser that schedule changes affect consumer availability and shop holidays block booking dates.
7. Clean all fixtures before commit.

