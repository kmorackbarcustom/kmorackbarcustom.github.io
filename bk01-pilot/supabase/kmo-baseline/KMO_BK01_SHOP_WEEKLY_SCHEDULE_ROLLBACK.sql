-- Rollback for KMO BK01 shop-level recurring weekly schedule patch.
BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_shop_weekly_booking_hours ON local_service.bookings;
DROP FUNCTION IF EXISTS local_service.enforce_shop_weekly_booking_hours();
DROP FUNCTION IF EXISTS local_service.upsert_shop_weekly_schedule(uuid,jsonb);
DROP TABLE IF EXISTS local_service.shop_weekly_schedules;

COMMIT;
