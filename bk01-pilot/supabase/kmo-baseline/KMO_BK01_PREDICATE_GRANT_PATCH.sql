-- =============================================================================
-- KMO BK01 - LR-03 / LR03-WU01 - narrow predicate-grant patch (brief section A)
-- Purpose: add EXACTLY two column-scoped SELECT grants that let the public
--   booking consumer page use the shop_id predicate it already relies on:
--     GRANT SELECT (shop_id) ON local_service.staff_schedules TO anon;
--     GRANT SELECT (shop_id) ON local_service.shop_holidays   TO anon;
-- Date: 2026-09-25 (Asia/Bangkok)
-- Dependency: KMO_BK01_BASELINE.sql.
--   The existing anon column grants on both tables (baseline lines 1748 and 1750)
--   stay in force and are NOT narrowed by this file:
--     staff_schedules {staff_id, day_of_week, is_working_day, work_start, work_end,
--                      break_start, break_end}
--     shop_holidays   {staff_id, holiday_date, reason}
--   The consumer page (apps/booking-consumer/src/lib/booking-service.ts) selects
--   exactly those columns and additionally filters on shop_id, which is why the
--   predicate column grant is required on top of them.
-- NO RUNTIME APPLY - reviewable SQL source only. No database connection was made
--   while producing this file. Any apply is LR-08 / Owner-authorized.
-- Scope guarantees: this file issues no REVOKE, no table-wide SELECT, no write
--   privilege of any kind, and changes neither RLS nor any policy on any table.
--   GRANT is naturally idempotent, so re-running is a no-op.
-- Atomicity: the whole file is one BEGIN ... COMMIT block, so a partial failure
--   cannot leave half-applied state (in practice the second grant either lands
--   with the first or neither does).
-- =============================================================================
BEGIN;

GRANT SELECT (shop_id) ON local_service.staff_schedules TO anon;
GRANT SELECT (shop_id) ON local_service.shop_holidays TO anon;

COMMIT;
