-- KMO-FIRST hardening: weekly fail-closed + staff/shop schedule consistency.
-- Date: 2026-09-09
BEGIN;

CREATE OR REPLACE FUNCTION local_service.ensure_shop_weekly_schedule_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
  INSERT INTO local_service.shop_weekly_schedules(shop_id, day_of_week, is_open, open_time, close_time)
  SELECT NEW.id, d, false, NULL, NULL
  FROM generate_series(0, 6) AS d
  ON CONFLICT(shop_id, day_of_week) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_shop_weekly_schedule_rows ON local_service.shops;
CREATE TRIGGER trg_ensure_shop_weekly_schedule_rows
AFTER INSERT ON local_service.shops
FOR EACH ROW EXECUTE FUNCTION local_service.ensure_shop_weekly_schedule_rows();

-- Existing shops: create only missing weekdays and fail safe as closed.
INSERT INTO local_service.shop_weekly_schedules(shop_id, day_of_week, is_open, open_time, close_time)
SELECT s.id, d, false, NULL, NULL
FROM local_service.shops s CROSS JOIN generate_series(0, 6) AS d
ON CONFLICT(shop_id, day_of_week) DO NOTHING;
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
   WHERE shop_id = NEW.shop_id
     AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_WEEKLY_SCHEDULE_NOT_CONFIGURED';
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

CREATE OR REPLACE FUNCTION local_service.upsert_staff_weekly_schedule(
  p_staff_id UUID,
  p_days JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_shop_id UUID;
  v_day_count INTEGER;
  v_distinct_day_count INTEGER;
  v_invalid_count INTEGER;
BEGIN
  SELECT shop_id INTO v_shop_id
  FROM local_service.staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;
  IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner','admin']::TEXT[]) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Owner or admin role required';
  END IF;

  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Schedule days must be a JSON array' USING ERRCODE='22023';
  END IF;
  SELECT COUNT(*), COUNT(DISTINCT day_of_week)
    INTO v_day_count, v_distinct_day_count
    FROM jsonb_to_recordset(p_days) AS d(
      day_of_week INTEGER,
      is_working_day BOOLEAN,
      work_start TIME,
      work_end TIME,
      break_start TIME,
      break_end TIME
    );

  IF v_day_count <> 7 OR v_distinct_day_count <> 7 THEN
    RAISE EXCEPTION 'Schedule must contain each day from 0 through 6 exactly once' USING ERRCODE='22023';
  END IF;

  SELECT COUNT(*) INTO v_invalid_count
  FROM jsonb_to_recordset(p_days) AS d(
    day_of_week INTEGER,
    is_working_day BOOLEAN,
    work_start TIME,
    work_end TIME,
    break_start TIME,
    break_end TIME
  )
  LEFT JOIN local_service.shop_weekly_schedules s
    ON s.shop_id = v_shop_id
   AND s.day_of_week = d.day_of_week
  WHERE d.day_of_week NOT BETWEEN 0 AND 6
     OR d.is_working_day IS NULL
     OR d.work_start IS NULL
     OR d.work_end IS NULL
     OR d.work_start >= d.work_end
     OR ((d.break_start IS NULL) <> (d.break_end IS NULL))
     OR (d.break_start IS NOT NULL AND (
          d.break_start >= d.break_end
       OR d.break_start < d.work_start
       OR d.break_end > d.work_end
     ))
     OR (d.is_working_day AND (
          s.day_of_week IS NULL
       OR NOT s.is_open
       OR d.work_start < s.open_time
       OR d.work_end > s.close_time
     ));

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Staff schedule must stay within configured shop opening days and hours' USING ERRCODE='22023';
  END IF;

  INSERT INTO local_service.staff_schedules(
    shop_id, staff_id, day_of_week, is_working_day,
    work_start, work_end, break_start, break_end
  )
  SELECT v_shop_id, p_staff_id, day_of_week, is_working_day,
         work_start, work_end, break_start, break_end
  FROM jsonb_to_recordset(p_days) AS d(
    day_of_week INTEGER,
    is_working_day BOOLEAN,
    work_start TIME,
    work_end TIME,
    break_start TIME,
    break_end TIME
  )
  ON CONFLICT(staff_id, day_of_week) DO UPDATE
  SET shop_id = EXCLUDED.shop_id,
      is_working_day = EXCLUDED.is_working_day,
      work_start = EXCLUDED.work_start,
      work_end = EXCLUDED.work_end,
      break_start = EXCLUDED.break_start,
      break_end = EXCLUDED.break_end;
END;
$$;

REVOKE ALL ON FUNCTION local_service.ensure_shop_weekly_schedule_rows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION local_service.enforce_shop_weekly_booking_hours() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION local_service.upsert_staff_weekly_schedule(uuid,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.upsert_staff_weekly_schedule(uuid,jsonb) TO authenticated;

COMMIT;