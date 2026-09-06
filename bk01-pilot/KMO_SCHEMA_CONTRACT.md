# KMO BK01 — Gate 2 Schema Contract Lock

Status: **LOCKED — Gate 2 complete**
Date: 2026-09-06
Scope: KMO RACKBARCUSTOM only
Production project: `xfhpwxjywqgqefbncumm`
Upstream BK01 copy: `82b297df2d42156e750794ac4135852450570264`

## Decision
KMO production and BK01 are different domain models and must remain separate during the pilot.

- `public.*` remains the existing KMO operational domain.
- `local_service.*` becomes the BK01 booking domain.
- `kmo_bridge.*` is reserved for mapping, reconciliation and cutover state.
- KMO-only vehicle/job/pickup/cart data must not be added to canonical BK01 core tables.
- No existing KMO table is renamed, dropped or repurposed to satisfy BK01.

This contract is based on the Gate 1 live audit plus the committed BK01 migration/app surface.
Raw live-audit JSON remains local-only and is excluded from Git.

## Live evidence used
Gate 1 confirmed the live KMO database has `public.bookings`, `public.orders`, `public.customers`
and `public.production_allocations`, with real production rows, triggers, functions and migration history.
## Authority matrix

| Domain/object | Authority during pilot | Contract |
|---|---|---|
| `public.bookings` | Existing KMO booking compatibility | Preserve; no BK01 columns injected; legacy write path remains until controlled cutover. |
| `public.customers` | Existing KMO customer identity | Preserve; map explicitly to BK01 customer identities; never merge tables in place. |
| `public.orders` | KMO order/job authority | BK01 must not own or replace this table. |
| `public.production_allocations` | KMO production scheduling authority | BK01 must not own or replace this table. |
| `local_service.shops` | BK01 | One KMO shop tenant/config root. |
| `local_service.shop_users` | BK01 | Booking-admin membership/roles only. |
| `local_service.services` | BK01 | Bookable service/catalog abstraction. |
| `local_service.staff` | BK01 | Booking staff/provider abstraction. |
| `local_service.staff_schedules` | BK01 | Time-slot availability support. |
| `local_service.shop_holidays` | BK01 | Booking availability exclusions. |
| `local_service.customers` | BK01 | Booking-domain customer record; separate from `public.customers`. |
| `local_service.bookings` | BK01 | New booking/deposit lifecycle; never a rename of `public.bookings`. |
| `local_service.booking_status_history` | BK01 support | Booking lifecycle audit/history. |
| `kmo_bridge.*` | KMO integration boundary | ID mapping, reconciliation and cutover state only; no business-domain duplication. |

## Why `public.bookings` cannot become `local_service.bookings`
Live KMO booking is date/job/vehicle/production oriented. BK01 booking is service/staff/time-slot/deposit oriented.
The two records may describe the same customer event, but they are not the same schema contract.
### Field ownership boundary
KMO legacy fields such as `job_id`, `brand`, `model`, `product`, `color`, `pickup_date`, `images`,
`cart_meta`, `estimated_total`, `source_page`, queue/production status and mechanic assignment are KMO concerns.
They must live in KMO-owned extension/bridge structures or remain in the legacy KMO domain.

BK01 owns booking concepts such as `shop_id`, `service_id`, `staff_id`, `booking_date`, `start_time`,
`end_time`, booking status, deposit status, deposit amount, slip reference and recovery/hold state.

Allowed semantic mappings for migration are explicit transformations, not column aliases:
- KMO appointment date may seed BK01 `booking_date` only when the conversion rule is proven.
- KMO customer name/phone/LINE identity may seed `local_service.customers` with a bridge link.
- Deposit history may seed BK01 deposit state only after status semantics are reconciled.
- KMO `note` may be copied to BK01 notes when needed.
- Vehicle/job/production fields never become generic BK01 booking columns.

## Customer identity contract
`public.customers` and `local_service.customers` remain separate identities.
The live KMO model has its own LINE identity behavior; BK01 uses tenant-scoped phone identity.
A bridge mapping is therefore mandatory for migrated or linked customers.
No direct table replacement or shared primary key is allowed.

## Order and production contract
Booking ends at customer intake/appointment/deposit responsibility.
Once the motorcycle becomes a shop job/order, KMO `public.orders` and production scheduling remain authoritative.
BK01 must not become an order-management or production-planning system.
## BK01 supporting capability classification

### Required or compatibility-required for the current KMO app
- `line_users` / `line_notification_logs`: BK01 booking-notification state only; must not replace KMO LINE OA conversational state.
- `subscriptions`: entitlement/plan compatibility only. KMO remains Stripe-free; Stripe runtime is not permitted.
- `booking_recovery_attempts`: required by the booking recovery/upload-intent path.
- `account_closure_requests`: currently referenced by the copied admin UI/RPC and must either exist or be deliberately removed from the KMO UI before baseline lock.
- `audit_events` and `entitlement_usage`: retain only where required by active BK01 RPC/authorization behavior.
- `auto_slip_attempts`: BK01 auto-slip evidence/state only; it never proves bank settlement by itself.

### Excluded from KMO pilot product surface
- `stripe_webhook_events` and Stripe webhook/customer-portal runtime.
- `platform_admins` / WSTERA platform-control authorization.
- `tickets` and `ticket_timeline_entries`; ticket runtime was intentionally excluded from the KMO copy.

Historical migrations may reference excluded objects. Gate 4 must create a dependency-safe KMO baseline
rather than deleting migration files or replaying the upstream chain blindly.

## LINE boundary
KMO already has live LINE AI/chat, image handling, customer context and Telegram notification flows.
BK01 LINE objects may serve booking-specific notifications, but they do not own KMO's general LINE conversation runtime.
Any future integration must be adapter-based and must not duplicate or overwrite existing KMO session/customer state.
## Gate 3 inputs now locked
Gate 3 may design KMO-only extension/bridge objects, but must obey these rules:
1. No FK or schema change may force existing KMO rows to satisfy BK01 assumptions.
2. Bridge mappings must support one-time reconciliation and controlled cutover, not permanent uncontrolled dual-write.
3. Legacy IDs and BK01 UUIDs remain independently meaningful; mappings are explicit.
4. New KMO-specific booking detail fields must live outside canonical BK01 core.
5. Existing production triggers/RPCs are treated as contracts until explicitly migrated and tested.
6. RLS must be designed independently for `local_service` and `kmo_bridge`; existing `public` RLS is not inherited.
7. No service-role credential may be exposed to either browser application.
8. No production DDL is authorized by this document.

## Gate 2 verdict
**PASS / LOCKED.**

The schema ownership boundary is now sufficiently defined to proceed to Gate 3 — KMO extension and bridge design.
Gate 3 is design-only until its DDL, rollback and dependency review are complete.
