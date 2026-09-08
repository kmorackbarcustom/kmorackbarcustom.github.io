# KMO BK01 Ã¢â‚¬â€ Gate 5 Dark Deploy Evidence

Date: 2026-09-08
Target: `KMO-Booking` (`xfhpwxjywqgqefbncumm`)
Branch: `pilot/bk01-independent-deployment`
Mode: isolated dark deploy; legacy KMO remains primary

## Applied package

Baseline SHA-256:
`a79867b65d91a3e7958a6d96b0d002f031f4c1c20cb5bff96683014689da60ea`

Rollback SHA-256:
`381464103d22d50c6d6d52208027ac849c7417ad10faee25ac33b446ae0c05f9`

The baseline executed as one transaction through the linked KMO project and completed without SQL error.
No seed shop, user, PromptPay identity, customer migration, route cutover, or legacy data write was included.

## Legacy protection evidence

Pre-deploy `public.*` shape fingerprint:
`e5216d0a944aae965389b394b0414a91`

Post-deploy `public.*` shape fingerprint:
`e5216d0a944aae965389b394b0414a91`

Result: **MATCH Ã¢â‚¬â€ existing public schema shape was not changed.**
## New isolated runtime evidence

- `local_service` exists.
- `kmo_booking` exists.
- `kmo_bridge` exists.
- `btree_gist` is installed.
- `local_service`: 15 tables, 33 functions, 15 policies, 3 user triggers.
- RLS: 20/20 new tables enabled; 0 disabled.
- `kmo_bridge` and `kmo_booking`: no anonymous schema usage.
- Anonymous staff access includes public display fields but excludes `staff.phone`.

Private Storage bucket `deposit-slips`:
- `public = false`
- file size limit = 5 MiB
- MIME allow-list = JPEG / PNG / WebP

## Backup / recovery evidence

Pre-Gate-5 logical backup is stored outside Git under:
`D:\AI-Workspace\backups\kmo-bk01\2026-09-08-pre-gate5`

Evidence includes one-statement `public` snapshot, schema metadata, manifest, restore validation SQL and fail-closed emergency restore SQL.
Restore validation cast the saved JSON back through the live production row types for all 28 public tables: **28/28 PASS, 2706/2706 rows**.
Backup content is intentionally not tracked in Git.
## Legacy route health

Public GitHub Pages checks after baseline apply:
- `https://kmorackbarcustom.github.io/booking.html` Ã¢â‚¬â€ HTTP 200
- `https://kmorackbarcustom.github.io/bookingdashboard.html` Ã¢â‚¬â€ HTTP 200

Legacy KMO remains the active customer/admin path. No route switch has occurred.

## Data API exposure and tenant smoke closure

Owner/Admin added `local_service` to Data API exposed schemas. PostgREST probe then reported exactly:
`public, graphql_public, local_service`.

`kmo_booking` and `kmo_bridge` remain unexposed. Anonymous `staff.name` reads are allowed while anonymous `staff.phone` reads are denied; direct anonymous INSERT on `customers` and `bookings` is denied; anonymous execution of `create_booking_hold` is allowed.

One real KMO tenant was provisioned with only locked values: `KMO RACKBARCUSTOM`, slug `kmo-rackbarcustom`, default deposit 500 THB, active compatibility subscription, and cutover phase `dark_deploy`. PromptPay remains unset and no Auth owner has been created because `auth.users` is empty.

Reproducible provisioning is tracked in supabase/kmo-baseline/KMO_BK01_TENANT_PROVISION.sql. Data API exposure is tracked in the root supabase/config.toml.

Rollback-only booking smoke created temporary service/staff/schedule/customer/booking rows, verified a 500 THB hold and collision rejection, then rolled the transaction back. Post-rollback counts for service/staff/schedule/customer/booking/notification/history were all zero.

Pre-deploy vs post-deploy object comparison of legacy `public.*` is exact: 28 tables, 413 columns, 103 constraints, 50 indexes, 3 policies, 28 RLS flags, 8 triggers and 53 functions all show added 0 / removed 0. Migration history remains 43 entries. Production data counts may continue changing because the legacy shop is live.

## Current verdict

**DATABASE DARK DEPLOY: PASS**
**LEGACY PROTECTION: PASS**
**BACKUP / RESTORE EVIDENCE: PASS**
**DATA API EXPOSURE: PASS**
**KMO TENANT PROVISION: PASS**
**BOOKING CORE ROLLBACK SMOKE: PASS**
**ADMIN AUTH / SHOP MEMBERSHIP: PENDING REAL OWNER ACCOUNT**
**PROMPTPAY / DEPOSIT END-TO-END: PENDING VERIFIED PROMPTPAY IDENTITY**
**CUSTOMER CUTOVER: NOT STARTED**

Do not route customer traffic to BK01 yet. The remaining real-user prerequisites are an intentional KMO Auth owner identity plus a verified supported PromptPay recipient before admin/deposit end-to-end smoke and later shadow/cutover gates.