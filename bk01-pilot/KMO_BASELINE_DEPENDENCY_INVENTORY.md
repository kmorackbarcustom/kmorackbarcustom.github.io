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
Transitive SQL dependency closure: **COMPLETE**.
Baseline SQL generation: **COMPLETE**.
Static baseline verification: **PASS**.
Production apply: **NOT AUTHORIZED / NOT RUN**.

## Gate 4 closure update — 2026-09-06
A second pass parsed exact dollar-quoted final function bodies instead of broad SQL blocks.
This removed false transitive dependencies caused by adjacent statements.

Final active RPC closure:
- 23 direct app RPCs — all resolved to committed definitions.
- Required function helpers: `generate_booking_code`, `generate_link_token`, `get_tier_limits`, `has_shop_role`, `is_shop_member`, `is_shop_owner`.
- RLS additionally requires `current_staff_id`.

The corrected closure does **not** require `tickets`, `ticket_timeline_entries`, `platform_admins`, `entitlement_usage`, `apply_topup`, or commercial quota/top-up runtime.
## Storage dependency
Source scan also found an active Supabase Storage dependency not covered by the original `.from()` / `.rpc()` scan:
- private bucket: `deposit-slips`
- customer uploads use server-issued signed upload URLs;
- object path contract: `<booking_uuid>/<object_uuid>.(jpg|png|webp)`;
- maximum upload request size: 5 MiB;
- admin UI creates a 300-second signed read URL.

Gate 1 confirmed KMO production does not currently have a `deposit-slips` bucket.
Gate 5 must create it private and add a shop-scoped authenticated SELECT policy; no anonymous direct object INSERT policy is required.
## Gate 4 final verification ? 2026-09-07
- Active app dependency check: 23/23 RPCs resolved; all runtime relations/views resolved.
- Storage dependency: private `deposit-slips` bucket included.
- Baseline SQL parses successfully as 153 PostgreSQL statements.
- Containment rollback parses successfully as 7 PostgreSQL statements.
- `verify-kmo-baseline.py`: PASS.
- App tests: 17/17 PASS; lint: 0 errors / 8 inherited warnings; consumer/admin production builds PASS.
- SELECT-only production refresh confirmed target schemas and bucket are still absent and protected `public.*` counts are unchanged from Gate 1.

Gate 4 verdict: **PASS / LOCKED**. Gate 5 remains **NOT AUTHORIZED** pending backup/restore evidence and final pre-apply readback.
