-- =============================================================================
-- KMO BK01 - LR-03 / LR03-WU01 - ROLLBACK for KMO_BK01_INTAKE_WORK_STATE_PATCH.sql
-- Purpose: bounded reversal of exactly what KMO_BK01_INTAKE_WORK_STATE_PATCH.sql
--   added. Nothing else is touched.
-- Date: 2026-09-25 (Asia/Bangkok)
-- Dependency: apply only against a KMO state that has
--   KMO_BK01_INTAKE_WORK_STATE_PATCH.sql applied. Baseline objects must stay.
-- NO RUNTIME APPLY - reviewable SQL source only. No database connection was made
--   while producing this file. Any apply is LR-08 / Owner-authorized.
--
-- REVERSED (created by the patch, dropped here):
--   local_service.staff_schedules trigger trg_enforce_staff_hours_within_shop_hours
--   local_service.enforce_staff_hours_within_shop_hours()
--   kmo_booking.service_intake_policy trigger + enforce_service_intake_policy_shop_scope()
--   kmo_booking.booking_work_state_events trigger + reject_append_only_mutation()
--   kmo_booking.booking_intake trigger + reject_booking_intake_mutation()
--   kmo_booking.intake_settings
--   kmo_booking.service_intake_policy
--   kmo_booking.booking_intake
--   kmo_booking.booking_work_state
--   kmo_booking.booking_work_state_events
--
-- NOTHING ELSE IS TOUCHED OUTSIDE kmo_booking except the section E trigger/function
--   on the pre-existing local_service.staff_schedules table. In particular no
--   local_service.services constraint is added or dropped by this pair: the patch
--   enforces shop/service consistency with a trigger precisely so that no generic
--   local_service constraint has to be created (the baseline has no unique
--   constraint on services(id, shop_id) that a composite FK could reference).
--
-- DELIBERATELY NOT REVERSED (disclosed, not a silent omission):
--   * KMO_BK01_BASELINE.sql's GRANT USAGE ON SCHEMA kmo_booking TO service_role is
--     baseline-owned, not patch-created. The patch only conditionally re-issues it
--     as a no-op when it was already present; distinguishing "the patch created it"
--     from "the baseline created it" is not reliably possible from DDL alone, so
--     this rollback does not revoke schema USAGE. No privilege level is raised or
--     lowered relative to the pre-patch baseline by leaving it in place.
--   * KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql objects
--     (local_service.enforce_shop_weekly_booking_hours(),
--      local_service.ensure_shop_weekly_schedule_rows(),
--      local_service.upsert_staff_weekly_schedule(uuid,jsonb)) and
--     local_service.shop_weekly_schedules are untouched. Weekly fail-closed stays intact.
--   * anon/authenticated column grants on local_service.staff_schedules and
--     local_service.shop_holidays are untouched - those belong to
--     KMO_BK01_PREDICATE_GRANT_ROLLBACK.sql.
--
-- WARNING (loss of history, not a defect): booking_intake and
--   booking_work_state_events hold booking capacity snapshots and transition audit.
--   Dropping them discards that data. There is no data-preserving rollback for the
--   tables themselves; a backup/restore path is the recovery mechanism before apply.
--
-- Atomicity: the whole file is one BEGIN ... COMMIT block, so a partial failure
--   cannot leave half-rolled-back state.
-- =============================================================================
BEGIN;

-- 1. Section E invariant: trigger, then function.
DROP TRIGGER IF EXISTS trg_enforce_staff_hours_within_shop_hours
  ON local_service.staff_schedules;
DROP FUNCTION IF EXISTS local_service.enforce_staff_hours_within_shop_hours();

-- 2. Guard triggers and their functions (dropped before the tables they guard).
DROP TRIGGER IF EXISTS trg_enforce_service_intake_policy_shop_scope
  ON kmo_booking.service_intake_policy;
DROP FUNCTION IF EXISTS kmo_booking.enforce_service_intake_policy_shop_scope();

DROP TRIGGER IF EXISTS trg_reject_work_state_event_mutation
  ON kmo_booking.booking_work_state_events;
DROP FUNCTION IF EXISTS kmo_booking.reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_reject_booking_intake_mutation
  ON kmo_booking.booking_intake;
DROP FUNCTION IF EXISTS kmo_booking.reject_booking_intake_mutation();

-- 3. The five kmo_booking tables (child/reference ordering is irrelevant here:
--    nothing outside this set references them).
DROP TABLE IF EXISTS kmo_booking.booking_work_state_events;
DROP TABLE IF EXISTS kmo_booking.booking_work_state;
DROP TABLE IF EXISTS kmo_booking.booking_intake;
DROP TABLE IF EXISTS kmo_booking.service_intake_policy;
DROP TABLE IF EXISTS kmo_booking.intake_settings;

COMMIT;
