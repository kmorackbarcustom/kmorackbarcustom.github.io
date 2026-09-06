# KMO BK01 — Gate 4 Baseline Dependency Inventory

Status: **IN PROGRESS — direct dependency scan complete**
Date: 2026-09-06
Scope: KMO controlled copy only

## Method
Static scan of the active KMO booking consumer/admin TypeScript source for Supabase `.from()` and `.rpc()` calls,
then mapping those names back to the copied BK01 migration chain.
This is a baseline-authoring input, not proof that every transitive SQL dependency is closed.

## Direct relation/view dependencies — 12
- `bookings`
- `customers`
- `line_notification_logs`
- `line_users`
- `services`
- `shop_holidays`
- `shop_public_profile`
- `shop_users`
- `shops`
- `staff`
- `staff_schedules`
- `subscriptions`

All are expected under the BK01 `local_service` schema because the KMO app clients set that schema explicitly.
## Direct RPC dependencies — 23
- `approve_booking_deposit`
- `authorize_booking_recovery_attempt`
- `cancel_booking`
- `claim_due_line_notifications`
- `complete_line_notification`
- `create_booking_hold`
- `create_service`
- `create_shop_holiday`
- `create_staff`
- `customer_cancel_booking`
- `customer_reschedule_booking`
- `delete_shop_holiday`
- `export_core_business_data`
- `link_staff_user`
- `reject_deposit_slip`
- `request_account_closure`
- `set_booking_outcome`
- `set_service_active`
- `set_staff_active`
- `submit_deposit_slip`
- `update_service`
- `update_shop_settings`
- `upsert_staff_weekly_schedule`

Every direct RPC name has at least one definition in the copied migration chain.
## Directly excluded product surfaces
No active KMO app `.from()` or `.rpc()` reference was found for:
- `tickets`
- `ticket_timeline_entries`
- `platform_admins`
- `stripe_webhook_events`

That supports excluding those product surfaces from the KMO baseline, subject to transitive SQL dependency closure.

## Compatibility dependency that remains active
`subscriptions` is still read by the KMO consumer notification/LINE paths for the shop `plan`.
Therefore the KMO baseline needs entitlement/plan compatibility even though KMO is Stripe-free.
It does **not** authorize Stripe Checkout, Customer Portal or Stripe webhook runtime.

## Transitive dependency candidates
The copied SQL chain also contains support objects that may be required by active RPCs/triggers even when the app never queries them directly:
- `booking_status_history`
- `booking_recovery_attempts`
- `entitlement_usage`
- `auto_slip_attempts`
- `audit_events`
- `account_closure_requests`
- notification retry/state columns and supporting functions

Their migration-file co-occurrence with active RPCs is evidence to inspect, not sufficient proof by itself.
Gate 4 must inspect the final function/trigger definitions before omitting any of these objects.
## Baseline authoring constraints
1. Build from final object definitions/dependency closure, not by replaying the historical migration sequence.
2. Include the Gate 3 `kmo_booking` and `kmo_bridge` objects in the same reviewed baseline package or a clearly ordered companion migration.
3. Do not modify existing KMO `public.bookings`, `public.customers`, `public.orders` or `public.production_allocations` in the baseline.
4. Do not seed demo shops, demo users, Stripe IDs or WSTERA platform-admin data.
5. Seed only one KMO shop/config row and only after required real KMO values are known.
6. Keep PromptPay recipient unset until a supported KMO PromptPay identity is verified.
7. RLS/grants must fail closed before dark deploy.
8. Produce rollback SQL and backup evidence before production execution.

## Current Gate 4 state
Direct app dependency scan: **COMPLETE**.
Transitive SQL dependency closure: **NEXT**.
Baseline SQL generation: **NOT STARTED**.
Production apply: **NOT AUTHORIZED / NOT RUN**.
