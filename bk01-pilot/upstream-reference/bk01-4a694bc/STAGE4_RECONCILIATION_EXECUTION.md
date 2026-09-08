# Stage 4 Reconciliation Execution

- Repo path: D:\AI-Workspace\projects\saas-product-hub\products\booking
- Branch: main
- HEAD SHA: 2472e1230ef5db739fdc9d4afa44c8d3dd33445b
- Date: 2026-08-19 21:05:10 +07:00 (Asia/Bangkok)
- Scope: git/filesystem evidence plus supabase db push --dry-run only.
- Normalization used for pair comparison: CRLF to LF, trailing whitespace stripped on every line, empty trailing lines dropped.

## 26-Pair Summary

Status counts: IDENTICAL=23, SQL MATCH (comment-only drift)=3, DIFFERS=0

The 3 comment-only pairs show local header/comment drift only. SQL body lines match the remote files after removing comment lines and blank separators.

| # | Filename | Status | Local bytes | Remote bytes |
|---:|---|---|---:|---:|
| 1 | 20260807051615_local_service_initial_schema.sql | IDENTICAL | 5877 | 5877 |
| 2 | 20260807051629_staff_schedules.sql | IDENTICAL | 2179 | 2179 |
| 3 | 20260807051642_line_notifications.sql | IDENTICAL | 2131 | 2131 |
| 4 | 20260807051755_product_rules_v1.sql | IDENTICAL | 17139 | 17139 |
| 5 | 20260807051839_booking_submission_and_availability_guards.sql | IDENTICAL | 10683 | 10683 |
| 6 | 20260807051914_harden_function_search_paths.sql | SQL MATCH (comment-only drift) | 834 | 693 |
| 7 | 20260807052218_seed_demo_shop.sql | IDENTICAL | 65 | 65 |
| 8 | 20260807052329_fix_service_deposit_override.sql | IDENTICAL | 8408 | 8408 |
| 9 | 20260807052408_fix_booking_history_trigger_timing.sql | IDENTICAL | 767 | 767 |
| 10 | 20260807054727_fix_link_token_volatility.sql | IDENTICAL | 1049 | 1049 |
| 11 | 20260807101942_phase_a_data_integrity_and_authorization.sql | IDENTICAL | 16716 | 16716 |
| 12 | 20260807104205_phase_a_data_integrity_and_authorization.sql | IDENTICAL | 17495 | 17495 |
| 13 | 20260807135141_phase_c_fail_closed_staff_schedules.sql | IDENTICAL | 9960 | 9960 |
| 14 | 20260807161412_phase_e1_owner_auth_and_provisioning.sql | IDENTICAL | 4311 | 4311 |
| 15 | 20260807170901_phase_e2_admin_booking_actions.sql | IDENTICAL | 4157 | 4157 |
| 16 | 20260807175455_phase_e3_1_services_staff_authorization.sql | IDENTICAL | 9343 | 9343 |
| 17 | 20260807181852_phase_e3_2_schedules_holidays_authorization.sql | IDENTICAL | 7054 | 7054 |
| 18 | 20260807191046_phase_e3_3_shop_settings_authorization.sql | IDENTICAL | 3958 | 3958 |
| 19 | 20260807191259_phase_e3_3_fix_public_profile_view.sql | SQL MATCH (comment-only drift) | 1179 | 349 |
| 20 | 20260809002422_phase_e4_1_subscriptions_schema.sql | SQL MATCH (comment-only drift) | 1659 | 1231 |
| 21 | 20260810094413_phase_e4_3_stripe_webhook_events.sql | IDENTICAL | 1098 | 1098 |
| 22 | 20260810094434_phase_e4_4_sync_subscription_state_rpc.sql | IDENTICAL | 7309 | 7309 |
| 23 | 20260810122551_phase_e4_4_fix_sync_subscription_state_ambiguous_column.sql | IDENTICAL | 6465 | 6465 |
| 24 | 20260810122817_phase_e4_4_fix_sync_subscription_state_rename_out_param_v2.sql | IDENTICAL | 5879 | 5879 |
| 25 | 20260813081349_launch_1_billing_truth_and_booking_gate.sql | IDENTICAL | 6421 | 6421 |
| 26 | 20260813092245_platform_admin_authorization.sql | IDENTICAL | 6145 | 6145 |

## Per-Pair Diff Detail

Each block is the normalized diff -u output comparing supabase/migrations/<filename> against _remote_stmts/<filename>. Empty diff blocks are recorded as no diff after normalization.

### 20260807051615_local_service_initial_schema.sql

- Status: **IDENTICAL**
- Local bytes: 5877
- Remote bytes: 5877

```diff
(no diff after normalization)
```

### 20260807051629_staff_schedules.sql

- Status: **IDENTICAL**
- Local bytes: 2179
- Remote bytes: 2179

```diff
(no diff after normalization)
```

### 20260807051642_line_notifications.sql

- Status: **IDENTICAL**
- Local bytes: 2131
- Remote bytes: 2131

```diff
(no diff after normalization)
```

### 20260807051755_product_rules_v1.sql

- Status: **IDENTICAL**
- Local bytes: 17139
- Remote bytes: 17139

```diff
(no diff after normalization)
```

### 20260807051839_booking_submission_and_availability_guards.sql

- Status: **IDENTICAL**
- Local bytes: 10683
- Remote bytes: 10683

```diff
(no diff after normalization)
```

### 20260807051914_harden_function_search_paths.sql

- Status: **SQL MATCH (comment-only drift)**
- Local bytes: 834
- Remote bytes: 693

```diff
--- supabase/migrations/20260807051914_harden_function_search_paths.sql
+++ _remote_stmts/20260807051914_harden_function_search_paths.sql
@@ -1,7 +1,5 @@
 -- Harden SECURITY DEFINER functions against search_path hijacking
 -- Date: 2026-08-07
--- Fixes: Supabase advisor WARN "function_search_path_mutable" on 6 functions
--- created by earlier migrations without a pinned search_path.
 
 ALTER FUNCTION local_service.is_shop_member(UUID) SET search_path = pg_catalog, local_service;
 ALTER FUNCTION local_service.generate_booking_code() SET search_path = pg_catalog, local_service;
```

### 20260807052218_seed_demo_shop.sql

- Status: **IDENTICAL**
- Local bytes: 65
- Remote bytes: 65

```diff
(no diff after normalization)
```

### 20260807052329_fix_service_deposit_override.sql

- Status: **IDENTICAL**
- Local bytes: 8408
- Remote bytes: 8408

```diff
(no diff after normalization)
```

### 20260807052408_fix_booking_history_trigger_timing.sql

- Status: **IDENTICAL**
- Local bytes: 767
- Remote bytes: 767

```diff
(no diff after normalization)
```

### 20260807054727_fix_link_token_volatility.sql

- Status: **IDENTICAL**
- Local bytes: 1049
- Remote bytes: 1049

```diff
(no diff after normalization)
```

### 20260807101942_phase_a_data_integrity_and_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 16716
- Remote bytes: 16716

```diff
(no diff after normalization)
```

### 20260807104205_phase_a_data_integrity_and_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 17495
- Remote bytes: 17495

```diff
(no diff after normalization)
```

### 20260807135141_phase_c_fail_closed_staff_schedules.sql

- Status: **IDENTICAL**
- Local bytes: 9960
- Remote bytes: 9960

```diff
(no diff after normalization)
```

### 20260807161412_phase_e1_owner_auth_and_provisioning.sql

- Status: **IDENTICAL**
- Local bytes: 4311
- Remote bytes: 4311

```diff
(no diff after normalization)
```

### 20260807170901_phase_e2_admin_booking_actions.sql

- Status: **IDENTICAL**
- Local bytes: 4157
- Remote bytes: 4157

```diff
(no diff after normalization)
```

### 20260807175455_phase_e3_1_services_staff_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 9343
- Remote bytes: 9343

```diff
(no diff after normalization)
```

### 20260807181852_phase_e3_2_schedules_holidays_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 7054
- Remote bytes: 7054

```diff
(no diff after normalization)
```

### 20260807191046_phase_e3_3_shop_settings_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 3958
- Remote bytes: 3958

```diff
(no diff after normalization)
```

### 20260807191259_phase_e3_3_fix_public_profile_view.sql

- Status: **SQL MATCH (comment-only drift)**
- Local bytes: 1179
- Remote bytes: 349

```diff
--- supabase/migrations/20260807191259_phase_e3_3_fix_public_profile_view.sql
+++ _remote_stmts/20260807191259_phase_e3_3_fix_public_profile_view.sql
@@ -1,16 +1,3 @@
--- Phase E3.3 fix: shop_public_profile was created WITH (security_invoker =
--- true), which meant Postgres also checked the QUERYING role's own
--- privileges on the underlying `shops` table -- so revoking anon's table-
--- level SELECT in the prior migration broke the view for anon too, not just
--- direct table access. Caught via a real anon REST call against the view
--- (401 permission denied on `shops`, not just the intended direct-table
--- test) before this was reported as verified.
---
--- The view has a fixed column list and a fixed WHERE is_active = true with
--- no caller-supplied input, so there is no bypass risk in letting it run
--- with the defining role's privileges (the default, security_invoker =
--- false) instead. This is the standard pattern for exposing a restricted
--- column subset of a locked-down table.
 CREATE OR REPLACE VIEW local_service.shop_public_profile AS
 SELECT
     id,
```

### 20260809002422_phase_e4_1_subscriptions_schema.sql

- Status: **SQL MATCH (comment-only drift)**
- Local bytes: 1659
- Remote bytes: 1231

```diff
--- supabase/migrations/20260809002422_phase_e4_1_subscriptions_schema.sql
+++ _remote_stmts/20260809002422_phase_e4_1_subscriptions_schema.sql
@@ -1,9 +1,3 @@
--- Phase E4.1: subscriptions table for Stripe billing state.
--- Schema only -- Stripe account not yet provisioned, so no RPC/webhook wiring
--- here. service_role (used by the future webhook handler) bypasses RLS and
--- is the only writer until E4.3. Owner-only read matches PRODUCT_RULES_V1
--- section 7 ("จัดการแพ็กเกจและการชำระเงิน" = owner only, admin/staff no access).
-
 CREATE TABLE local_service.subscriptions (
     id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
     shop_id UUID NOT NULL UNIQUE REFERENCES local_service.shops(id),
```

### 20260810094413_phase_e4_3_stripe_webhook_events.sql

- Status: **IDENTICAL**
- Local bytes: 1098
- Remote bytes: 1098

```diff
(no diff after normalization)
```

### 20260810094434_phase_e4_4_sync_subscription_state_rpc.sql

- Status: **IDENTICAL**
- Local bytes: 7309
- Remote bytes: 7309

```diff
(no diff after normalization)
```

### 20260810122551_phase_e4_4_fix_sync_subscription_state_ambiguous_column.sql

- Status: **IDENTICAL**
- Local bytes: 6465
- Remote bytes: 6465

```diff
(no diff after normalization)
```

### 20260810122817_phase_e4_4_fix_sync_subscription_state_rename_out_param_v2.sql

- Status: **IDENTICAL**
- Local bytes: 5879
- Remote bytes: 5879

```diff
(no diff after normalization)
```

### 20260813081349_launch_1_billing_truth_and_booking_gate.sql

- Status: **IDENTICAL**
- Local bytes: 6421
- Remote bytes: 6421

```diff
(no diff after normalization)
```

### 20260813092245_platform_admin_authorization.sql

- Status: **IDENTICAL**
- Local bytes: 6145
- Remote bytes: 6145

```diff
(no diff after normalization)
```

## Dry-Run Output

Command run from repo root:

```powershell
supabase db push --dry-run
```

Verbatim output captured:

```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
Finished supabase db push.
 • 20260818000000_local_service_tickets.sql
 • 20260819000000_quota_staff_topup_enforcement.sql
A new version of Supabase CLI is available: v2.115.0 (currently installed v2.101.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
```

Exit code: 0

Conclusion: the ONLY pending migrations shown by dry-run are:
- 20260818000000_local_service_tickets.sql
- 20260819000000_quota_staff_topup_enforcement.sql

Expected pending migrations for this gate:
- 20260818000000_local_service_tickets.sql
- 20260819000000_quota_staff_topup_enforcement.sql

## Hard Stops Respected

- No real supabase db push was run; only supabase db push --dry-run was executed.
- No supabase migration repair was run.
- No supabase db reset was run.
- No deploy command was run.
- No production DB write was performed.
- No .secrets file or directory was accessed.

## Generation Notes

- Remote source: _remote_stmts/*.sql on disk.
- Local source: supabase/migrations/<same filename> on disk.
- Pair count verified from real filesystem: 26 remote files, each with a same-named local counterpart.
- Diff tool: GNU diff -u from Git for Windows, run against normalized temporary files outside the repo.
