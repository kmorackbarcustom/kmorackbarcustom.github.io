# KMO BK01 Ã¢â‚¬â€ Gate 4 Baseline Manifest

Status: **LOCKED INPUT SET Ã¢â‚¬â€ SQL authoring next**
Date: 2026-09-06
Scope: KMO RACKBARCUSTOM controlled copy only
Upstream copy ref: `82b297df2d42156e750794ac4135852450570264`

## Purpose
Define the exact database object boundary for the KMO dark-deploy baseline.
This is an end-state deployment manifest, not permission to replay the upstream migration chain.

## Schemas
- `local_service` Ã¢â‚¬â€ BK01 runtime exposed to the booking/admin apps.
- `kmo_booking` Ã¢â‚¬â€ KMO-only booking detail extension; not exposed directly to browser clients.
- `kmo_bridge` Ã¢â‚¬â€ mapping/reconciliation/cutover state; not exposed directly to browser clients.

Existing KMO `public.*`, `auth.*` and `storage.*` remain outside baseline ownership.
## `local_service` tables
Required runtime tables:
- `shops`
- `shop_users`
- `services`
- `staff`
- `customers`
- `bookings`
- `staff_schedules`
- `shop_holidays`
- `line_users`
- `line_notification_logs`
- `booking_status_history`
- `subscriptions` Ã¢â‚¬â€ compatibility only; no Stripe runtime
- `booking_recovery_attempts`
- `audit_events`
- `account_closure_requests`

Required view:
- `shop_public_profile`
## Active RPC contract
Direct app RPCs: 23.
Required helper functions from final-function dependency closure: 7 including RLS helper `current_staff_id`.

Direct RPCs:
`approve_booking_deposit`, `authorize_booking_recovery_attempt`, `cancel_booking`,
`claim_due_line_notifications`, `complete_line_notification`, `create_booking_hold`,
`create_service`, `create_shop_holiday`, `create_staff`, `customer_cancel_booking`,
`customer_reschedule_booking`, `delete_shop_holiday`, `export_core_business_data`,
`link_staff_user`, `reject_deposit_slip`, `request_account_closure`,
`set_booking_outcome`, `set_service_active`, `set_staff_active`, `submit_deposit_slip`,
`update_service`, `update_shop_settings`, `upsert_staff_weekly_schedule`.

Helpers:
`generate_booking_code`, `generate_link_token`, `get_tier_limits`, `has_shop_role`,
`is_shop_member`, `is_shop_owner`, `current_staff_id`.
## Required trigger contract
Keep:
- `trg_enforce_booking_status_transition` -> `enforce_booking_status_transition`
- `trg_enforce_shop_booking_acceptance` -> `enforce_shop_booking_acceptance`
- `trg_enqueue_booking_notifications` -> `enqueue_booking_notifications`

Do not include KMO runtime triggers for:
- commercial booking quota enforcement
- automatic SaaS trial/subscription initialization
- WSTERA platform-admin audit
- ticket authorization

KMO subscription compatibility will be provisioned explicitly for the single KMO tenant during dark-deploy setup, not by a public SaaS onboarding trigger.
## KMO-specific schemas
`kmo_booking.details` owns KMO-only booking detail keyed by `local_service.bookings.id`.
Expected fields: `booking_id`, `brand`, `model`, `product`, `color`, `pickup_date`, `images`,
`cart_meta`, `estimated_total`, `source`, `source_page`, optional mechanic metadata, timestamps.

`kmo_bridge` baseline tables:
- `customer_links`
- `booking_links`
- `reconciliation_runs`
- `cutover_state`

Bridge rows are mapping/control evidence only and must not cascade-delete existing KMO production data.
## Explicit exclusions
Do not create in KMO baseline:
- `stripe_webhook_events` or Stripe sync/customer-portal RPCs
- `platform_admins` or platform-control RPCs/types/policies
- `tickets` / `ticket_timeline_entries`
- commercial quota/top-up runtime (`entitlement_usage`, `apply_topup`, quota trigger)
- demo shop/demo user seed data
- WSTERA production identities or secrets

## KMO security overrides
- Remove broad anonymous direct INSERT policies on `customers` and `bookings`; intake goes through `create_booking_hold()`.
- `audit_events` owner read policy must not reference `is_platform_admin()`.
- RLS enabled on every new table.
- `kmo_booking` and `kmo_bridge` have no anonymous policies and are not browser-exposed.
- Security-definer functions must pin `search_path` and receive explicit EXECUTE grants only.

## Manifest verdict
Dependency closure for the active KMO app is **COMPLETE**.
Baseline SQL and containment rollback have been authored from final object definitions plus the KMO overrides above.
Production apply remains **NOT AUTHORIZED** until Gate 5 backup/restore evidence and final pre-apply checks pass.
## Storage object
Required private bucket: `deposit-slips`.
- max file size: 5 MiB
- allowed MIME: `image/jpeg`, `image/png`, `image/webp`
- customer upload: signed upload URL issued by server/service-role path
- authenticated shop owner/admin: scoped SELECT only for objects whose first path segment is a booking in their shop
- no anonymous direct INSERT/SELECT policy

The live KMO project did not contain this bucket at Gate 1, so its creation belongs to the isolated dark-deploy package.
## Gate 4 package verification ? 2026-09-07
- Baseline: `supabase/kmo-baseline/KMO_BK01_BASELINE.sql`
- Rollback: `supabase/kmo-baseline/KMO_BK01_ROLLBACK.sql`
- Static verifier: `scripts/verify-kmo-baseline.py`
- Baseline SHA-256: `3c4546507ec529b9a23363b9c81b6793f6d3e4a9301440ccf26c2168a2caf5ff`
- Rollback SHA-256: `381464103d22d50c6d6d52208027ac849c7417ad10faee25ac33b446ae0c05f9`
- PostgreSQL parser: baseline 153 statements PASS; rollback 7 statements PASS.
- Runtime compatibility readback: KMO search path includes `extensions`; `btree_gist` is currently absent and will be created only at Gate 5.
- No existing KMO `public.*` mutation is present in baseline or rollback.

Gate 4 verdict: **PASS / LOCKED**.
