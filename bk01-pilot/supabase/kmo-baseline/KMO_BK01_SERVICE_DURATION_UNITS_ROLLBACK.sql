-- Rollback for KMO service duration units.
-- Refuses lossy rollback after any service has been intentionally changed
-- away from legacy minute semantics.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM local_service.services
    WHERE duration_unit IS DISTINCT FROM 'minute'
       OR duration_value IS DISTINCT FROM duration_minutes::NUMERIC
  ) THEN
    RAISE EXCEPTION 'KMO_DURATION_UNIT_ROLLBACK_UNSAFE: non-legacy duration semantics exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_supported_service_booking_duration
ON local_service.bookings;
DROP TRIGGER IF EXISTS trg_normalize_service_duration
ON local_service.services;

DROP FUNCTION IF EXISTS local_service.enforce_supported_service_booking_duration();
DROP FUNCTION IF EXISTS local_service.normalize_service_duration();
DROP FUNCTION IF EXISTS local_service.create_service_v2(uuid,text,text,numeric,text,numeric,numeric,uuid);
DROP FUNCTION IF EXISTS local_service.update_service_v2(uuid,text,text,numeric,text,numeric,numeric);
ALTER TABLE local_service.services
  DROP CONSTRAINT IF EXISTS services_duration_value_ck,
  DROP CONSTRAINT IF EXISTS services_duration_unit_ck,
  DROP COLUMN IF EXISTS duration_value,
  DROP COLUMN IF EXISTS duration_unit;

COMMIT;
