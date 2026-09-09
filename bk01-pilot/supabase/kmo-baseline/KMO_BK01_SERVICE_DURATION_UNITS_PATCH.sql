-- KMO-FIRST service duration units
-- Owner requirement: each service can use minute, hour, or day.
-- `day` is persisted truthfully but remains fail-closed for online booking
-- until a real day-span booking engine exists.
BEGIN;

ALTER TABLE local_service.services
  ADD COLUMN IF NOT EXISTS duration_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS duration_unit TEXT DEFAULT 'minute';

UPDATE local_service.services
SET duration_value = duration_minutes,
    duration_unit = 'minute'
WHERE duration_value IS NULL OR duration_unit IS NULL;

ALTER TABLE local_service.services
  ALTER COLUMN duration_value SET NOT NULL,
  ALTER COLUMN duration_unit SET NOT NULL;

ALTER TABLE local_service.services
  DROP CONSTRAINT IF EXISTS services_duration_value_ck;
ALTER TABLE local_service.services
  ADD CONSTRAINT services_duration_value_ck CHECK (duration_value > 0);

ALTER TABLE local_service.services
  DROP CONSTRAINT IF EXISTS services_duration_unit_ck;
ALTER TABLE local_service.services
  ADD CONSTRAINT services_duration_unit_ck
  CHECK (duration_unit IN ('minute','hour','day'));
CREATE OR REPLACE FUNCTION local_service.normalize_service_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_minutes NUMERIC;
BEGIN
  -- Preserve backward compatibility for legacy callers that update only
  -- duration_minutes. New V2 callers own duration_value + duration_unit.
  IF TG_OP = 'UPDATE'
     AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     AND NEW.duration_value IS NOT DISTINCT FROM OLD.duration_value
     AND NEW.duration_unit IS NOT DISTINCT FROM OLD.duration_unit THEN
    NEW.duration_value := NEW.duration_minutes;
    NEW.duration_unit := 'minute';
  ELSIF NEW.duration_value IS NULL THEN
    NEW.duration_value := NEW.duration_minutes;
  END IF;
  NEW.duration_unit := COALESCE(NULLIF(BTRIM(NEW.duration_unit), ''), 'minute');

  IF NEW.duration_value IS NULL OR NEW.duration_value <= 0 THEN
    RAISE EXCEPTION 'Service duration must be greater than zero' USING ERRCODE='22023';
  END IF;

  IF NEW.duration_unit = 'minute' THEN
    IF NEW.duration_value <> TRUNC(NEW.duration_value) THEN
      RAISE EXCEPTION 'Minute duration must be a whole number' USING ERRCODE='22023';
    END IF;
    v_minutes := NEW.duration_value;
  ELSIF NEW.duration_unit = 'hour' THEN
    v_minutes := NEW.duration_value * 60;
    IF v_minutes <> TRUNC(v_minutes) THEN
      RAISE EXCEPTION 'Hour duration must convert to whole minutes' USING ERRCODE='22023';
    END IF;
  ELSIF NEW.duration_unit = 'day' THEN
    IF NEW.duration_value <> TRUNC(NEW.duration_value) THEN
      RAISE EXCEPTION 'Day duration must be a whole number' USING ERRCODE='22023';
    END IF;
    v_minutes := NEW.duration_value * 1440;
  ELSE
    RAISE EXCEPTION 'Unsupported duration unit' USING ERRCODE='22023';
  END IF;

  IF v_minutes > 2147483647 THEN
    RAISE EXCEPTION 'Service duration is too large' USING ERRCODE='22003';
  END IF;

  NEW.duration_minutes := v_minutes::INTEGER;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_service_duration ON local_service.services;
CREATE TRIGGER trg_normalize_service_duration
BEFORE INSERT OR UPDATE OF duration_value, duration_unit, duration_minutes
ON local_service.services
FOR EACH ROW EXECUTE FUNCTION local_service.normalize_service_duration();

CREATE OR REPLACE FUNCTION local_service.create_service_v2(
  p_shop_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_duration_value NUMERIC,
  p_duration_unit TEXT,
  p_price NUMERIC,
  p_deposit_amount NUMERIC,
  p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_service_id UUID;
BEGIN
  IF NOT local_service.has_shop_role(p_shop_id, ARRAY['owner','admin']::TEXT[]) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Owner or admin role required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE='22023';
  END IF;
  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Service name is required' USING ERRCODE='22023';
  END IF;
  IF p_duration_value IS NULL OR p_duration_value <= 0
     OR p_duration_unit NOT IN ('minute','hour','day') THEN
    RAISE EXCEPTION 'Invalid service duration' USING ERRCODE='22023';
  END IF;
  IF p_price IS NULL OR p_price < 0 OR p_deposit_amount IS NULL
     OR p_deposit_amount < 0 OR p_deposit_amount > p_price THEN
    RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_service_id
  FROM local_service.services
  WHERE shop_id=p_shop_id AND creation_idempotency_key=p_idempotency_key;
  IF v_service_id IS NOT NULL THEN RETURN v_service_id; END IF;

  INSERT INTO local_service.services(
    shop_id,name,description,duration_minutes,duration_value,duration_unit,
    price,deposit_amount,is_active,creation_idempotency_key
  ) VALUES (
    p_shop_id,BTRIM(p_name),NULLIF(BTRIM(p_description),''),1,
    p_duration_value,p_duration_unit,p_price,p_deposit_amount,true,p_idempotency_key
  ) RETURNING id INTO v_service_id;
  RETURN v_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.update_service_v2(
  p_service_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_duration_value NUMERIC,
  p_duration_unit TEXT,
  p_price NUMERIC,
  p_deposit_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_service local_service.services%ROWTYPE;
BEGIN
  SELECT * INTO v_service FROM local_service.services
  WHERE id=p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT local_service.has_shop_role(v_service.shop_id, ARRAY['owner','admin']::TEXT[]) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Owner or admin role required';
  END IF;
  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Service name is required' USING ERRCODE='22023';
  END IF;
  IF p_duration_value IS NULL OR p_duration_value <= 0
     OR p_duration_unit NOT IN ('minute','hour','day') THEN
    RAISE EXCEPTION 'Invalid service duration' USING ERRCODE='22023';
  END IF;
  IF p_price IS NULL OR p_price < 0 OR p_deposit_amount IS NULL
     OR p_deposit_amount < 0 OR p_deposit_amount > p_price THEN
    RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE='22023';
  END IF;

  UPDATE local_service.services
  SET name=BTRIM(p_name), description=NULLIF(BTRIM(p_description),''),
      duration_value=p_duration_value, duration_unit=p_duration_unit,
      price=p_price, deposit_amount=p_deposit_amount
  WHERE id=p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.enforce_supported_service_booking_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_unit TEXT;
BEGIN
  SELECT duration_unit INTO v_unit
  FROM local_service.services
  WHERE id=NEW.service_id AND shop_id=NEW.shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SERVICE_DURATION_CONFIGURATION_MISSING';
  END IF;
  IF v_unit='day' THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DAY_SPAN_BOOKING_NOT_ENABLED';
  END IF;
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SERVICE_DURATION_EXCEEDS_SAME_DAY_BOOKING';
  END IF;
  IF NEW.start_timestamptz IS NOT NULL AND NEW.end_timestamptz IS NOT NULL
     AND (NEW.start_timestamptz AT TIME ZONE 'Asia/Bangkok')::DATE
         <> (NEW.end_timestamptz AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SERVICE_DURATION_EXCEEDS_SAME_DAY_BOOKING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_supported_service_booking_duration ON local_service.bookings;
CREATE TRIGGER trg_enforce_supported_service_booking_duration
BEFORE INSERT OR UPDATE OF shop_id,service_id,booking_date,start_time,end_time,start_timestamptz,end_timestamptz
ON local_service.bookings
FOR EACH ROW EXECUTE FUNCTION local_service.enforce_supported_service_booking_duration();

GRANT SELECT(duration_value,duration_unit) ON local_service.services TO anon,authenticated;
REVOKE ALL ON FUNCTION local_service.create_service_v2(uuid,text,text,numeric,text,numeric,numeric,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION local_service.create_service_v2(uuid,text,text,numeric,text,numeric,numeric,uuid)
TO authenticated;

REVOKE ALL ON FUNCTION local_service.update_service_v2(uuid,text,text,numeric,text,numeric,numeric)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION local_service.update_service_v2(uuid,text,text,numeric,text,numeric,numeric)
TO authenticated;

REVOKE ALL ON FUNCTION local_service.normalize_service_duration()
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION local_service.enforce_supported_service_booking_duration()
FROM PUBLIC,anon,authenticated;

COMMIT;
