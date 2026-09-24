-- =============================================================================
-- KMO BK01 - LR-03 / LR03-WU01 - ROLLBACK for KMO_BK01_PREDICATE_GRANT_PATCH.sql
-- Purpose: revoke EXACTLY the two column-scoped SELECT grants that
--   KMO_BK01_PREDICATE_GRANT_PATCH.sql added - nothing else:
--     REVOKE SELECT (shop_id) ON local_service.staff_schedules FROM anon;
--     REVOKE SELECT (shop_id) ON local_service.shop_holidays   FROM anon;
-- Date: 2026-09-25 (Asia/Bangkok)
-- Dependency: apply only against a KMO state that has
--   KMO_BK01_PREDICATE_GRANT_PATCH.sql applied.
-- NO RUNTIME APPLY - reviewable SQL source only. No database connection was made
--   while producing this file. Any apply is LR-08 / Owner-authorized.
-- Scope guarantees: the pre-existing anon column grants on both tables
--   (baseline lines 1748 and 1750) are deliberately left in place - they are not
--   patch-created and must keep working. No table-wide privilege is revoked, no
--   write privilege is revoked, and no RLS or policy is touched.
--   REVOKE of an absent grant is a no-op, so re-running is safe.
-- Atomicity: the whole file is one BEGIN ... COMMIT block, so a partial failure
--   cannot leave half-reverted state.
-- =============================================================================
BEGIN;

REVOKE SELECT (shop_id) ON local_service.staff_schedules FROM anon;
REVOKE SELECT (shop_id) ON local_service.shop_holidays FROM anon;

COMMIT;
