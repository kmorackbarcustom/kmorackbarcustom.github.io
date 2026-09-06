# KMO BK01 — Gate 3 Extension & Bridge Design

Status: **LOCKED — Gate 3 complete**
Date: 2026-09-06
Scope: KMO RACKBARCUSTOM only
Depends on: `KMO_SCHEMA_CONTRACT.md`

## Design decision
Use four explicit database domains:

```text
public.*          existing KMO operations (legacy booking, customers, orders, production)
local_service.*   BK01 generic booking core
kmo_booking.*     KMO-only booking detail extension
kmo_bridge.*      identity mapping, reconciliation and cutover state
```

`kmo_booking` is intentionally separate from `kmo_bridge`.
Vehicle/product/pickup/cart data is KMO business data, not reconciliation metadata.
The schema does not become part of canonical WSTERA BK01.

## KMO booking extension
Proposed table: `kmo_booking.details`, one row per BK01 booking.
Primary/foreign key: `booking_id -> local_service.bookings.id`.

Fields owned here: `brand`, `model`, `product`, `color`, `pickup_date`, `images`, `cart_meta`,
`estimated_total`, `source`, `source_page`, and optional KMO mechanic assignment metadata.
Fields explicitly excluded from the extension because another domain owns them:
- deposit lifecycle -> `local_service.bookings`
- booking status/time slot -> `local_service.bookings`
- job/order lifecycle -> `public.orders`
- production state/capacity -> `public.production_allocations` and existing KMO RPCs
- legacy booking identity/job code -> bridge mapping or legacy table, not duplicated business truth

## Customer bridge
Proposed table: `kmo_bridge.customer_links`.
It maps KMO legacy customer identity and BK01 booking customer identity without merging either table.

Required behavior:
- `legacy_customer_id` may be null for a BK01-only customer.
- `local_customer_id` may be null for a legacy-only customer during transition.
- at least one side must be present.
- each non-null side is unique.
- store `match_basis`, `link_status`, timestamps and last reconciliation time.
- exact known IDs outrank inferred matching.
- LINE UID may be used as evidence when present.
- normalized phone may be used only when it resolves to one unambiguous customer.
- conflicts remain unresolved for manual review; never auto-merge ambiguous customers.

No shared primary key and no cross-domain cascade delete is allowed.
## Booking bridge
Proposed table: `kmo_bridge.booking_links`.

The bridge must support three transitional states:
1. legacy-only KMO booking (`legacy_booking_id` present, `local_booking_id` null)
2. linked/reconciled booking (both IDs present)
3. BK01-only booking after cutover (`local_booking_id` present, `legacy_booking_id` null)

Required behavior:
- at least one booking ID must be present.
- each non-null booking ID is unique.
- store `link_status`, `source`, timestamps and last reconciliation time.
- optional legacy job reference may be retained only as traceability metadata.
- no bridge row creates or changes production/order truth by itself.

## Critical backfill decision
**Do not synthesize legacy KMO bookings into `local_service.bookings` by default.**

The live KMO model does not reliably provide BK01-required `service_id`, `staff_id`, `start_time` and `end_time`.
Inventing placeholder staff/time/service values would create false availability and corrupt booking semantics.

Therefore the default migration strategy is:
- leave already-existing legacy bookings in `public.bookings` until they complete or are explicitly reconciled;
- link identities/records in `kmo_bridge` when useful;
- create genuine BK01 records only when real BK01-required booking data exists;
- switch new customer intake to BK01 at controlled cutover rather than fabricating historical slots.
## Reconciliation and cutover state
Proposed table: `kmo_bridge.reconciliation_runs` for bounded migration/shadow checks.
Track phase, status, source/target counts, mismatch count, timestamps and non-sensitive metadata.

Proposed singleton/control row: `kmo_bridge.cutover_state`.
Allowed operational phases should be explicit, for example:
`legacy_active -> dark_deploy -> shadow -> freeze -> bk01_primary -> stabilized`,
with a rollback transition available until stabilization closes.

These tables are coordination evidence only. They do not replace Git history, daily logs or production backups.

## Dual-write rule
Permanent dual-write is prohibited.
If a temporary compatibility projection into `public.bookings` is required because a downstream KMO reminder/LINE/Telegram flow
has not yet been migrated, it must be:
- idempotent;
- explicitly marked transitional;
- reconciled;
- observable;
- assigned a removal gate before stabilization.

The preferred end state is new booking truth in BK01 plus KMO extension data, with order/production handoff to the existing KMO domain.

## Security contract
- Enable RLS on every new table even if the schema is server-only.
- No anonymous policy on bridge/reconciliation tables.
- Browser clients must not receive service-role credentials.
- Cross-schema write operations must use narrowly scoped RPC/server paths and explicit authorization.
- `kmo_bridge` and `kmo_booking` should not be exposed through PostgREST unless a concrete client requirement exists.
## Gate 4 baseline requirements
Gate 4 must generate a KMO-specific end-state baseline instead of replaying all upstream migrations.
The baseline must include only objects required by the active KMO booking/admin/notification paths and this Gate 3 design.

Before any production apply, Gate 4 must prove:
1. dependency closure for every included table/RPC/trigger/policy;
2. excluded Stripe/platform-admin/ticket surfaces are not required by active KMO routes;
3. rollback SQL or a tested recoverable database backup path exists;
4. new schemas/tables do not modify existing KMO production tables;
5. RLS and grants fail closed;
6. dark-deploy smoke tests can run without switching `booking.html` or production routing.

## Gate 3 verdict
**PASS / LOCKED.**

No production DDL was executed in Gate 3.
Next: Gate 4 — build the dependency-safe KMO BK01 baseline and rollback package for review/dark deploy.
