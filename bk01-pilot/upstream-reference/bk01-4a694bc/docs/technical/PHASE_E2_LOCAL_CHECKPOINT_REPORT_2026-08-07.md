# Phase E2 local checkpoint — real booking dashboard

Date: 2026-08-07
Status: local implementation complete; live migration and browser/RLS verification pending approval

## Implemented locally

- Replaced the booking mock array with tenant-scoped Supabase data.
- Removed the hard-coded `good-cuts-barber` lookup.
- The dashboard resolves the authenticated user's `shop_users` membership, then loads that shop and its bookings.
- Added loading, error/retry, empty, and mutation-in-progress states.
- Uses the current date in `Asia/Bangkok` instead of a fixed demo date.
- Uses the real shop slug for the consumer booking link.
- Added a required-reason cancellation modal.
- Corrected the reject-slip wording: rejection returns the booking to `hold` for 15 minutes; it does not cancel the booking.
- Approve, reject, and cancel now call guarded RPCs instead of direct `.update()` operations.

## Migration

`supabase/migrations/20260807165328_phase_e2_admin_booking_actions.sql`

The migration adds:

- `approve_booking_deposit(UUID)`
- `cancel_booking(UUID, TEXT)`
- authenticated-member checks inside both `SECURITY DEFINER` functions;
- row locks and state guards before updates;
- explicit revoke from `PUBLIC`, `anon`, and `service_role` with execute granted only to `authenticated`;
- removal of direct authenticated `INSERT`, `UPDATE`, and `DELETE` privileges on `bookings`, so browser clients cannot bypass the RPC layer;
- a member-select policy for the owner's shop, including when the shop is inactive.

Booking status history is left to the existing transition trigger. Cancellation reasons are required and appended to the booking notes; the RPC does not insert a duplicate history row.

## Local verification

- Targeted ESLint: zero errors; one existing `<img>` optimization warning for dynamic slip URLs.
- Root `npm run build`: passed for both apps with zero TypeScript/build errors.
- `git diff --check`: passed.
- `.env.local` was not modified.
- No live Supabase operation was performed.

## Required live verification

1. Apply the E2 migration to project `gyleqrjdzwwlqierdwcy`.
2. Confirm anon calls to both new RPCs are rejected.
3. Confirm authenticated direct writes to `bookings` are rejected.
4. Confirm user A can load and mutate bookings for shop A.
5. Confirm user B cannot approve, reject, or cancel shop A bookings.
6. Confirm invalid state combinations are rejected by the RPCs.
7. Confirm approve changes `pending_review/submitted` to `confirmed/verified`.
8. Confirm reject returns the booking to `hold/rejected` with a new 15-minute expiry.
9. Confirm cancel requires a non-blank reason, retains the deposit status, and changes only active bookings to `cancelled`.
10. Browser-test real loading, retry/error, empty state, approve, reject, cancel, and refreshed values.

## Out of scope

Services, staff, schedules, settings, billing, and platform-admin remain mock surfaces for later checkpoints.
