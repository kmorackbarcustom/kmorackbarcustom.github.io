# Stage 4 — Final Reconciliation Plan (Booking)

**Date:** 2026-08-19  
**Owner:** Stage 4 manager / Codex  
**Scope:** Read-only reconciliation summary + execution plan. No migration repair, no `db push`, no `db reset`, no deploy, no `.secrets` access, no migration edits executed in this task.  
**Project ref:** `gyleqrjdzwwlqierdwcy` (Project B)  
**Repo:** `D:\AI-Workspace\projects\saas-product-hub\products\booking`

---

## 1. Stage 4 finding summary

Stage 4 confirms that the Phase 0 baseline drift is real, but corrects one critical point from AGY's first report:

- Local `20260807064655_phase_a_data_integrity_and_authorization.sql` does **not** map to remote `20260807101942`.
- Local `20260807064655_phase_a_data_integrity_and_authorization.sql` maps to remote `20260807104205`.
- Remote `20260807101942` is an older `phase_a` SQL application that is not represented by any local migration file.
- The duplicate `phase_a` is therefore **not a no-op duplicate in migration history**.

Current live schema behavior is still aligned with the newer `phase_a` version because the second application used `CREATE OR REPLACE FUNCTION` and later `REVOKE` statements. The problem is migration-history/source-of-truth drift, not evidence of a currently active older `phase_a` behavior.

---

## 2. Evidence verified in this Stage 4 pass

### 2.1 Project/ref and repository state

- Linked Supabase project ref from `supabase/.temp/project-ref`: `gyleqrjdzwwlqierdwcy`.
- `git fetch --all --prune` completed.
- `main` is ahead of `origin/main` by 2 commits.
- Working tree before writing final reports had only the pre-existing untracked Stage 4 reports:
  - `STAGE4_INVESTIGATION.md`
  - `STAGE4_RECONCILIATION_PLAN.md`

Unpushed commits:

- `ed06fa2392c2c516d10926468b7171be18e0ebb0` — `feat(quota): enforce booking/staff/top-up limits per PRICING_SPEC`
- `2472e1230ef5db739fdc9d4afa44c8d3dd33445b` — `docs(qa): add Hermes' independent Stage 1 evidence audit`

### 2.2 Migration list/source-of-truth

Remote migration history:

- Remote `supabase_migrations.schema_migrations` has 26 rows.
- Remote has 25 distinct migration names.
- Remote has 2 rows named `phase_a_data_integrity_and_authorization`:
  - `20260807101942`
  - `20260807104205`

Local migration files:

- Local has 27 files under `supabase/migrations/`.
- No local filename timestamp matches any remote migration version timestamp.
- 25 local logical migrations correspond to current remote logical work, but with different timestamps.
- 2 local migrations are genuinely not applied to remote:
  - `20260818000000_local_service_tickets.sql`
  - `20260819000000_quota_staff_topup_enforcement.sql`

### 2.3 Corrected `phase_a` classification

Remote `phase_a` rows:

| Remote version | Statement length | MD5 | Classification |
|---|---:|---|---|
| `20260807101942` | 16716 | `4e05ba5e0c8308e2b152144f01f8895e` | older remote-only `phase_a` |
| `20260807104205` | 17495 | `ef4f4637ddbadfe9059029c275fd897f` | matches local file |

Local file:

| Local file | Length | MD5 | Markers |
|---|---:|---|---|
| `20260807064655_phase_a_data_integrity_and_authorization.sql` | 17495 | `ef4f4637ddbadfe9059029c275fd897f` | has `INSERT INTO local_service.booking_status_history`; has `REVOKE EXECUTE ... reject_deposit_slip ... FROM service_role` |

What v1-only contains:

- Older `reject_deposit_slip` behavior that finds the latest `booking_status_history` row and updates its `reason`.
- Older function grants that grant `EXECUTE` on:
  - `local_service.extend_booking_hold(UUID)` to `authenticated, service_role`
  - `local_service.reject_deposit_slip(UUID, TEXT)` to `authenticated, service_role`

What v2 adds/changes:

- Dedicated `INSERT INTO local_service.booking_status_history` for a reason-bearing audit row.
- A stricter guard: only `status = 'pending_review'` and `deposit_status = 'submitted'` can be rejected.
- `REVOKE EXECUTE` from `service_role` on `extend_booking_hold` and `reject_deposit_slip`.
- `REVOKE INSERT` from `PUBLIC, anon` on `bookings` and `customers`.

Current live behavior checked:

- `reject_deposit_slip` currently matches v2 behavior and inserts a dedicated audit row.
- `extend_booking_hold` and `reject_deposit_slip` are executable by `authenticated`.
- `extend_booking_hold` and `reject_deposit_slip` are not executable by `anon` or `service_role`.

Conclusion:

- Remote v1 does **not** appear to leave a current live schema behavior that is absent from local, because v2 overwrote/revoked the relevant behavior.
- Remote v1 **does** represent a real historical migration entry that local currently lacks.
- Any reconciliation plan must preserve or reconstruct remote v1 in local migration history before calling the history clean.

### 2.4 Local-only migrations are absent from remote

Read-only remote checks returned `NULL` for all expected objects:

- `to_regclass('local_service.tickets')`
- `to_regclass('local_service.entitlement_usage')`
- `to_regclass('local_service.quota_ledger')`
- `to_regclass('local_service.staff_topups')`
- `to_regclass('local_service.quota_topups')`

Conclusion:

- Tickets/case-management migration is not applied to remote.
- Quota/staff/top-up enforcement migration is not applied to remote.

### 2.5 E3.3 current live state

`local_service.shops` grants:

- `anon`: `REFERENCES`, `TRIGGER`, `TRUNCATE`; no `SELECT`, `INSERT`, `UPDATE`, or `DELETE`.
- `authenticated`: `SELECT`, plus non-DML privileges; no direct `INSERT`, `UPDATE`, or `DELETE`.
- `service_role`: full DML remains available, as expected for server-side privileged operations.

`local_service.shop_public_profile`:

- Exists as a view.
- `anon` has `SELECT`.
- `authenticated` has `SELECT`.

RLS state:

- RLS is enabled on these remote tables:
  - `booking_status_history`
  - `bookings`
  - `customers`
  - `line_notification_logs`
  - `line_users`
  - `platform_admins`
  - `services`
  - `shop_holidays`
  - `shop_users`
  - `shops`
  - `staff`
  - `staff_schedules`
  - `stripe_webhook_events`
  - `subscriptions`

Note: the remote/local schema uses `line_notification_logs` and `line_users`; `line_inbound_events` was not found as a current table.

Conclusion:

- The E3.3 column-exposure fix is still live.
- The repo still has no `supabase/tests/` automated RLS regression suite.
- `qa/` contains quota-focused tests, not the full Project B RLS/security matrix.

---

## 3. Options

### Option A — Reconstruct remote history locally, then apply only true local-only migrations (RECOMMENDED)

This is the corrected version of "re-timestamp local to match remote".

Concrete meaning:

1. Reconstruct the missing older remote `phase_a` row as a local migration file named with remote version `20260807101942`.
2. Rename the current local `phase_a` file to remote version `20260807104205`.
3. Rename the other 24 already-applied local migrations to their matching remote version timestamps.
4. Leave the 2 genuinely-new migrations (`tickets`, `quota`) with their current local timestamps as pending.

After this, local should have 28 migration files:

- 26 files matching the 26 remote migration-history rows.
- 2 pending files: tickets and quota.

Pros:

- Makes local repo accurately represent the remote history, including the older `phase_a` historical application.
- Preserves Project B's future source-of-truth in git instead of hiding drift in CLI metadata.
- Makes a later approved `supabase db push` predictable: expected pending set should be only tickets + quota.
- Keeps current local migration content for the newer `phase_a` because it already matches remote v2 byte-for-byte after normalized read.

Cons / risks:

- Requires migration-file churn: 24 renames, 1 `phase_a` rename, and 1 reconstructed historical `phase_a` file.
- Requires careful SQL content verification before any rename/add, not name-only matching.
- The reconstructed v1 file must be copied exactly from remote `schema_migrations.statements`; hand-authoring it risks creating a false history.
- Needs explicit Hermes/CEO approval because it edits migration files and changes the repo's migration history representation.

Decision:

- Recommended path for Project B after approval.
- Do not execute inside this read-only Stage 4 task.

### Option B — Treat remote as the source of truth and regenerate local migration history

Concrete meaning:

1. Dump all 26 remote migration-history statements.
2. Replace/rebuild the local migration set so the first 26 local files exactly match remote versions and statements.
3. Re-add or preserve tickets/quota as the only pending local migrations.

Pros:

- Represents remote reality most directly.
- Avoids trusting older local annotations or local filenames.
- Naturally includes both `phase_a` remote rows.

Cons / risks:

- More invasive than Option A.
- Can discard useful local comments/formatting/history in existing files.
- Requires heavy review of regenerated SQL and git diff.
- Makes future blame/history harder if the regenerated files differ stylistically from current local migrations.

Decision:

- Fallback if content diff shows broader mismatch beyond timestamp drift.
- Not the first choice because current evidence shows most local logical files are likely intended source files, and the corrected problem is reconstructable.

### Option C — `supabase migration repair`

Concrete meaning:

- Use Supabase CLI migration repair metadata commands to mark local migrations as applied.

Pros:

- Fast in CLI bookkeeping terms.

Cons / risks:

- Explicitly forbidden by this task.
- Does not reconstruct the missing remote v1 `phase_a` migration locally.
- Does not make git a truthful source of migration history.
- Can hide rather than resolve source-of-truth drift.
- Does not address the duplicate historical remote row.

Decision:

- Do not use for this Stage 4 reconciliation.
- Not recommended as the Project B path unless a future owner explicitly accepts metadata-only repair after a separate risk review.

---

## 4. Final recommendation

Use **Option A: reconstruct remote history locally**.

The key correction is that Option A must include a new local historical file for remote `20260807101942_phase_a_data_integrity_and_authorization.sql`. Renaming the current local `phase_a` file to `20260807104205` alone is not enough, because the older v1 row is a real remote migration-history entry.

Do not run `supabase db push` until:

- the 26 remote rows are represented locally by matching filenames and exact SQL content;
- `supabase migration list --linked` shows only tickets/quota as local pending;
- the team explicitly approves applying the two local-only migrations to remote.

---

## 5. Approved follow-up execution sequence

This sequence is for a future approved task. It was **not** executed in Stage 4.

### Phase 1 — Evidence freeze

1. Confirm branch/head and remote:
   - `git fetch --all --prune`
   - `git status --short --branch`
   - `git cherry -v origin/main main`
2. Export remote migration metadata and statements for all 26 rows from `supabase_migrations.schema_migrations`.
3. Store the export as a review artifact outside generated/runtime folders and without secrets.

### Phase 2 — Content parity review

1. Compare each remote statement to the intended local migration SQL.
2. For `phase_a`:
   - compare remote `20260807101942` against the reconstructed v1 SQL;
   - compare remote `20260807104205` against current local `20260807064655_phase_a...sql`;
   - confirm current live function definitions still match v2 behavior.
3. If any non-`phase_a` migration differs materially from local, stop and escalate before renaming.

### Phase 3 — Local migration-history reconstruction

1. Create `supabase/migrations/20260807101942_phase_a_data_integrity_and_authorization.sql` from the exact remote v1 statement.
2. Rename current local `20260807064655_phase_a_data_integrity_and_authorization.sql` to `20260807104205_phase_a_data_integrity_and_authorization.sql`.
3. Rename the other 24 already-applied local migrations to their corresponding remote timestamps.
4. Keep these two files unchanged as pending:
   - `20260818000000_local_service_tickets.sql`
   - `20260819000000_quota_staff_topup_enforcement.sql`
5. Run `git diff --check`.
6. Run `supabase migration list --linked`; expected result: only tickets/quota are local pending, with no remote-only rows.

### Phase 4 — Apply pending product work only after approval

1. Get explicit Hermes/CEO approval to apply tickets/quota to Project B remote.
2. Run `supabase db push` only if the expected pending set is exactly:
   - `20260818000000_local_service_tickets.sql`
   - `20260819000000_quota_staff_topup_enforcement.sql`
3. If the pending set differs, stop.

### Phase 5 — Verification after apply

1. Verify newly-created tickets/quota objects exist in remote.
2. Run quota QA against remote with controlled test data:
   - `qa/quota_enforcement_test.sql`
   - `qa/staff_gate_manual_test.sql`
3. Add `supabase/tests/` or equivalent automated RLS regression coverage for:
   - anonymous direct table access;
   - unauthenticated or signed-in-without-membership access;
   - wrong tenant;
   - wrong product;
   - staff role;
   - owner/admin role;
   - platform-admin boundary;
   - public view column exposure.
4. Re-run E3.3 public-profile REST checks after reconciliation.

### Phase 6 — Baseline publish

1. Push the 2 unpushed baseline commits only after the reconciliation decision is accepted:
   - `ed06fa2392c2c516d10926468b7171be18e0ebb0`
   - `2472e1230ef5db739fdc9d4afa44c8d3dd33445b`
2. Record the final clean baseline commit SHA in the Project B handoff.

---

## 6. Hard stops respected in this task

Confirmed:

- Did not run `supabase migration repair`.
- Did not run `supabase db push`.
- Did not run `supabase db reset`.
- Did not deploy.
- Did not read or touch `.secrets`.
- Did not edit any migration file.
- Did not run any write/DDL against remote DB.
- Modified only the requested report markdown files.

Status: final reconciliation plan written. Execution still requires explicit approval.
