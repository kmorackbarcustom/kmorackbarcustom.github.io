# Stage 4 — Phase 0 Baseline Investigation (Booking)

**Date:** 2026-08-19
**Owner:** agent-agy (AGY)
**Scope:** Read-only investigation. No migration repair, no `db push`, no deploy, no `.secrets` access, no migration edits.
**Project ref:** `gyleqrjdzwwlqierdwcy` (Project B)
**Repo:** `D:\AI-Workspace\projects\saas-product-hub\products\booking`

---

## 1. Migration drift — CONFIRMED, significant

### 1.1 What the CLI reports

`supabase migration list --linked` shows **26 remote** migrations vs **27 local** files. Critically, **every remote version timestamp differs from every local filename timestamp** — the two histories do not share a single matching version.

### 1.2 Root cause

The remote `supabase_migrations.schema_migrations` history was **not created by `supabase db push` from these local files**. It was created by applying SQL through the Supabase Dashboard (or a `db push` from a different repo state), which auto-assigns new timestamps. The remote `name` column matches the local filenames, but the `version` timestamps are all different.

### 1.3 Exact mapping (remote version → local file)

| Remote version | Remote name | Local file |
|---|---|---|
| 20260807051615 | local_service_initial_schema | 20260805000000 |
| 20260807051629 | staff_schedules | 20260805010000 |
| 20260807051642 | line_notifications | 20260805020000 |
| 20260807051755 | product_rules_v1 | 20260806000000 |
| 20260807051839 | booking_submission_and_availability_guards | 20260807000000 |
| 20260807051914 | harden_function_search_paths | 20260807020000 |
| 20260807052218 | seed_demo_shop | 20260807010000 |
| 20260807052329 | fix_service_deposit_override | 20260807030000 |
| 20260807052408 | fix_booking_history_trigger_timing | 20260807040000 |
| 20260807054727 | fix_link_token_volatility | 20260807050000 |
| 20260807101942 | phase_a_data_integrity_and_authorization | 20260807064655 |
| **20260807104205** | **phase_a_data_integrity_and_authorization (DUPLICATE)** | — (no local counterpart) |
| 20260807135141 | phase_c_fail_closed_staff_schedules | 20260807080000 |
| 20260807161412 | phase_e1_owner_auth_and_provisioning | 20260807155759 |
| 20260807170901 | phase_e2_admin_booking_actions | 20260807165328 |
| 20260807175455 | phase_e3_1_services_staff_authorization | 20260807174438 |
| 20260807181852 | phase_e3_2_schedules_holidays_authorization | 20260807181208 |
| 20260807191046 | phase_e3_3_shop_settings_authorization | 20260808000000 |
| 20260807191259 | phase_e3_3_fix_public_profile_view | 20260808000100 |
| 20260809002422 | phase_e4_1_subscriptions_schema | 20260809000000 |
| 20260810094413 | phase_e4_3_stripe_webhook_events | 20260810000000 |
| 20260810094434 | phase_e4_4_sync_subscription_state_rpc | 20260810000100 |
| 20260810122551 | phase_e4_4_fix_sync_subscription_state_ambiguous_column | 20260810000200 |
| 20260810122817 | phase_e4_4_fix_sync_subscription_state_rename_out_param_v2 | 20260810000300 |
| 20260813081349 | launch_1_billing_truth_and_booking_gate | 20260811174537 |
| 20260813092245 | platform_admin_authorization | 20260813000000 |

### 1.4 Drift findings

1. **Remote has a duplicate `phase_a` migration.** Two rows named `phase_a_data_integrity_and_authorization` exist in remote (`20260807101942` and `20260807104205`), each with 1 statement. Local has only one file (`20260807064655`). The phase_a SQL was applied twice via the dashboard with two different auto-timestamps.
2. **Local has 2 migrations NOT applied to remote:**
   - `20260818000000_local_service_tickets.sql` (ticket/case-management, 2026-08-18) — confirmed absent: no `tickets` table in remote `local_service` schema.
   - `20260819000000_quota_staff_topup_enforcement.sql` (quota/staff/top-up, 2026-08-19) — confirmed absent: no `entitlement_usage`/quota/top-up table in remote.
3. **Net:** remote = 26 entries = 25 unique logical migrations (one duplicated). Local = 27 files = 25 matching logical migrations + tickets + quota. The 25 unique logical migrations all have local counterparts; the divergence is the duplicate phase_a (remote-only) and the two newest local files (local-only).

### 1.5 Why this matters

Because no local filename timestamp matches any remote version, a naive `supabase db push` would attempt to re-apply **all 27 local files as brand-new migrations** — re-running `CREATE TABLE IF NOT EXISTS`/`CREATE POLICY`/`GRANT` statements against a live production DB. Some are idempotent (`IF NOT EXISTS`), but many are not (e.g. `CREATE POLICY` without `IF NOT EXISTS`, `REVOKE`/`GRANT`, function redefinition). This is exactly the "production DB Project B" blast radius the task forbids touching.

---

## 2. E3.3 live RLS/security verification gap — PARTIALLY CLOSED

### 2.1 The specific E3.3 column-exposure fix IS live and verified

Direct read-only queries against the remote DB confirm the E3.3 fix is applied and effective:

- **`shops` table grants:** `anon` has **no** `SELECT`/`INSERT`/`UPDATE`/`DELETE` (only harmless `REFERENCES`/`TRIGGER`/`TRUNCATE`). `authenticated` has `SELECT` only. The blanket `GRANT ALL` to `anon` that exposed `subscription_status`, `trial_ends_at`, `owner_name`, `business_category`, `requested_plan` is gone.
- **`shop_public_profile` view exists** and `anon`/`authenticated` both have `SELECT`. This is the column-restricted public view the consumer booking flow reads.
- **RLS policies present** on all core tables (`bookings`, `services`, `staff`, `staff_schedules`, `shop_holidays`, `shops`, `shop_users`, `customers`, `line_*`, `subscriptions`), matching the E3.3 completion report.

### 2.2 The remaining gap: NO automated RLS regression suite

The E3.3 verification was performed **manually** (per `PHASE_E3_3_COMPLETION_REPORT_2026-08-08.md`) with throwaway accounts, then the fixtures were deleted. There is **no `supabase/tests/` directory** and **no automated RLS/security regression test** in the repo. The `qa/` directory contains only the quota-enforcement tests (`quota_enforcement_test.sql`, `staff_gate_manual_test.sql`, `run_tests.sh`) — these test quota logic, not the RLS matrix.

**Status:** The specific E3.3 column-exposure vulnerability is closed and verified live. The broader PROJECT_B_PLAN §8 mandatory verification matrix (10 items: anonymous, unauthenticated, wrong-product, wrong-tenant, staff, owner, platform-admin, direct-table-access, storage-boundary, webhook-idempotency) is **not** covered by any automated test. This is the residual "E3.3 live RLS/security verification gap" — it is a test-coverage gap, not a known live vulnerability.

---

## 3. `git status` of `products/booking/` — CLEAN

- **Working tree is clean.** `git status` reports "nothing to commit, working tree clean." No uncommitted files.
- **The 4 previously-untracked paths from the deep-verify report are resolved:**
  - `.claude/launch.json` — **tracked** (committed in `5b8e0e1`)
  - `.qwen/settings.json` — **tracked** (committed in `5b8e0e1`)
  - `docs/proposals/PROPOSAL_MODULE_HUB_INTEGRATION.md` — **tracked** (committed in `5b8e0e1`)
  - `.claude/settings.local.json` — **gitignored** (intentionally not tracked; local tool config)
- **2 unpushed commits** on `main` (ahead of `origin/main` by 2):
  - `ed06fa2` — `feat(quota): enforce booking/staff/top-up limits per PRICING_SPEC` (the quota migration + QA suite)
  - `2472e12` — `docs(qa): add Hermes' independent Stage 1 evidence audit`

**Recommendation:** Both unpushed commits are the quota-enforcement work (Stage 1). They are committed and reviewed (Stage 1 evidence audit exists) but not pushed. **Push them** to close the "reviewed baseline commit" gate — but note the quota migration is local-only and NOT yet applied to remote (see §1.4), so pushing the commit does not touch the live DB.

---

## 4. Reconciliation plan (proposal only — NOT executed)

The drift is real and must be reconciled before Project B accepts a second product (PROJECT_B_PLAN §4 hard stop). Options, with trade-offs:

### Option A — Re-timestamp local files to match remote (RECOMMENDED)
Rename the 25 local migration files whose logical content already exists in remote so their filenames match the remote `version` timestamps. Then `supabase db push` would see only the 2 genuinely-new local migrations (tickets, quota) as pending.
- **Pros:** Makes local the source of truth; `db push` becomes safe and incremental; aligns with PROJECT_B_PLAN §4 "one migration owner, one release sequence."
- **Cons:** Requires renaming 25 files (git history churn); must verify each renamed file's content matches the remote-applied SQL (the remote `statements` column holds the applied text — compare before renaming). The duplicate phase_a row must be handled (see below).
- **Risk:** Low if content is verified first. This is a local-file operation, not a DB write.

### Option B — Mark remote as source of truth, re-sync local
Treat the remote history as canonical, regenerate local files to match, and add the 2 new migrations on top.
- **Pros:** No re-timestamping guesswork.
- **Cons:** Loses the local file history/annotations; more invasive to the repo.

### Option C — `supabase migration repair` to mark remote as applied
Use `supabase migration repair --status applied` to tell the CLI the local files are already applied.
- **Pros:** Fast.
- **Cons:** **FORBIDDEN by this task** (explicitly listed as a hard stop). Also fragile — it only fixes the CLI's bookkeeping, not the underlying timestamp mismatch, and does not resolve the duplicate phase_a.

### Handling the duplicate phase_a (required in any option)
The remote has two `phase_a_data_integrity_and_authorization` rows. Before reconciliation, confirm whether the second application (`20260807104205`) was a no-op re-run of the same SQL or introduced a second set of objects. If it was a no-op, the duplicate can be left as a historical artifact (harmless) or collapsed. This must be verified against the remote `statements` content before deciding.

### Recommended sequence (for a follow-up, approved task)
1. Dump the remote `statements` for all 26 rows; diff each against the corresponding local file to confirm content parity.
2. Confirm the phase_a duplicate is a no-op re-run.
3. Rename the 25 local files to match remote versions (Option A).
4. `supabase db push` — should now apply only tickets + quota.
5. Run the quota QA suite against the live DB (currently only tested in local `booking_qa2`).
6. Add an automated RLS regression suite (`supabase/tests/`) covering PROJECT_B_PLAN §8 matrix items 1–7.
7. Push the 2 unpushed commits.

---

## 5. Summary

| Item | Status |
|---|---|
| Migration drift | **CONFIRMED** — 26 remote vs 27 local; zero matching timestamps; remote created via dashboard (auto-timestamps); remote has duplicate phase_a; local has 2 unapplied migrations (tickets, quota) |
| E3.3 RLS/security gap | **Partially closed** — column-exposure fix verified live (shops grants + shop_public_profile view correct); residual gap is missing automated RLS regression suite (PROJECT_B_PLAN §8 matrix untested) |
| `git status` | **Clean** — no uncommitted files; 4 prior untracked paths resolved (3 committed, 1 gitignored); 2 unpushed commits (quota work) |
| Reconciliation | **Proposed** (Option A: re-timestamp local to match remote) — NOT executed; requires approval + content verification first |

**Hard stops respected:** No `migration repair`, no `db push`, no deploy, no `.secrets` access, no migration edits. All findings are from read-only `supabase db query` and `git` inspection.
