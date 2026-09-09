-- KMO BK01 downstream mitigation: shop-level recurring weekly schedule.
-- Date: 2026-09-09
-- Does not mutate legacy public.* objects.
BEGIN;

CREATE TABLE IF NOT EXISTS local_service.shop_weekly_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME,
  close_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, day_of_week),
  CONSTRAINT shop_weekly_schedule_hours_ck CHECK (
    (is_open = false AND open_time IS NULL AND close_time IS NULL)
    OR (is_open = true AND open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
  )
);

ALTER TABLE local_service.shop_weekly_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KMO public shop weekly schedules" ON local_service.shop_weekly_schedules;
CREATE POLICY "KMO public shop weekly schedules"
ON local_service.shop_weekly_schedules FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "KMO merchant shop weekly schedules read" ON local_service.shop_weekly_schedules;
CREATE POLICY "KMO merchant shop weekly schedules read"
ON local_service.shop_weekly_schedules FOR SELECT TO authenticated
USING (local_service.is_shop_member(shop_id));

CREATE OR REPLACE FUNCTION local_service.upsert_shop_weekly_schedule(
  p_shop_id UUID,
  p_days JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_day JSONB;
  v_day_of_week INTEGER;
  v_is_open BOOLEAN;
  v_open_time TIME;
  v_close_time TIME;
BEGIN
  IF NOT local_service.has_shop_role(p_shop_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
  END IF;

  IF jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) <> 7 THEN
    RAISE EXCEPTION 'Weekly schedule must contain exactly 7 days' USING ERRCODE = '22023';
  END IF;

  IF (SELECT COUNT(DISTINCT (item->>'day_of_week')::INTEGER) FROM jsonb_array_elements(p_days) item) <> 7 THEN
    RAISE EXCEPTION 'Weekly schedule must contain 7 unique weekdays' USING ERRCODE = '22023';
  END IF;
  FOR v_day IN SELECT value FROM jsonb_array_elements(p_days)
  LOOP
    v_day_of_week := (v_day->>'day_of_week')::INTEGER;
    IF v_day_of_week < 0 OR v_day_of_week > 6 THEN
      RAISE EXCEPTION 'day_of_week must be between 0 and 6' USING ERRCODE = '22023';
    END IF;

    v_is_open := COALESCE((v_day->>'is_open')::BOOLEAN, false);
    IF v_is_open THEN
      v_open_time := NULLIF(v_day->>'open_time', '')::TIME;
      v_close_time := NULLIF(v_day->>'close_time', '')::TIME;
      IF v_open_time IS NULL OR v_close_time IS NULL OR v_open_time >= v_close_time THEN
        RAISE EXCEPTION 'Open days require valid opening and closing times' USING ERRCODE = '22023';
      END IF;
    ELSE
      v_open_time := NULL;
      v_close_time := NULL;
    END IF;

    INSERT INTO local_service.shop_weekly_schedules(
      shop_id, day_of_week, is_open, open_time, close_time
    ) VALUES (
      p_shop_id, v_day_of_week, v_is_open, v_open_time, v_close_time
    )
    ON CONFLICT(shop_id, day_of_week) DO UPDATE
      SET is_open = EXCLUDED.is_open,
          open_time = EXCLUDED.open_time,
          close_time = EXCLUDED.close_time,
          updated_at = NOW();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.enforce_shop_weekly_booking_hours()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_schedule RECORD;
  v_day_of_week INTEGER;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM NEW.booking_date)::INTEGER;

  SELECT is_open, open_time, close_time
  INTO v_schedule
  FROM local_service.shop_weekly_schedules
  WHERE shop_id = NEW.shop_id AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_schedule.is_open, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_CLOSED_RECURRING_WEEKDAY';
  END IF;

  IF NEW.start_time < v_schedule.open_time OR NEW.end_time > v_schedule.close_time THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_OUTSIDE_WEEKLY_HOURS';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_shop_weekly_booking_hours ON local_service.bookings;
CREATE TRIGGER trg_enforce_shop_weekly_booking_hours
BEFORE INSERT OR UPDATE OF shop_id, booking_date, start_time, end_time ON local_service.bookings
FOR EACH ROW EXECUTE FUNCTION local_service.enforce_shop_weekly_booking_hours();

REVOKE ALL ON local_service.shop_weekly_schedules FROM PUBLIC, anon, authenticated;
GRANT SELECT(shop_id, day_of_week, is_open, open_time, close_time)
ON local_service.shop_weekly_schedules TO anon;
GRANT SELECT(id, shop_id, day_of_week, is_open, open_time, close_time, created_at, updated_at)
ON local_service.shop_weekly_schedules TO authenticated;
GRANT ALL ON local_service.shop_weekly_schedules TO service_role;

REVOKE ALL ON FUNCTION local_service.upsert_shop_weekly_schedule(uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION local_service.upsert_shop_weekly_schedule(uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION local_service.enforce_shop_weekly_booking_hours()
FROM PUBLIC, anon, authenticated;

-- Seed KMO from verified legacy shop_hours: 08:00-18:00, closed every Tuesday.
WITH kmo AS (
  SELECT id FROM local_service.shops WHERE slug = 'kmo-rackbarcustom' LIMIT 1
), days(day_of_week,is_open,open_time,close_time) AS (
  VALUES
    (0,true,'08:00'::time,'18:00'::time), (1,true,'08:00'::time,'18:00'::time),
    (2,false,NULL::time,NULL::time), (3,true,'08:00'::time,'18:00'::time),
    (4,true,'08:00'::time,'18:00'::time), (5,true,'08:00'::time,'18:00'::time),
    (6,true,'08:00'::time,'18:00'::time)
)
INSERT INTO local_service.shop_weekly_schedules(shop_id,day_of_week,is_open,open_time,close_time)
SELECT kmo.id,d.day_of_week,d.is_open,d.open_time,d.close_time FROM kmo CROSS JOIN days d
ON CONFLICT(shop_id,day_of_week) DO NOTHING;

COMMIT;
