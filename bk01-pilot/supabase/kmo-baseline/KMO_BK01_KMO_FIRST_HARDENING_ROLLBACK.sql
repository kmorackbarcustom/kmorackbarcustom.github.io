-- Roll back KMO-FIRST hardening to the pre-hardening KMO behavior.
-- Safe for the verified 2026-09-09 state: one shop, already 7/7 weekly rows.
BEGIN;

DROP TRIGGER IF EXISTS trg_ensure_shop_weekly_schedule_rows ON local_service.shops;
DROP FUNCTION IF EXISTS local_service.ensure_shop_weekly_schedule_rows();

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
    SELECT shop_id
      INTO v_shop_id
      FROM local_service.staff
     WHERE id = p_staff_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
        RAISE EXCEPTION 'Schedule days must be a JSON array' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT day_of_week)
      INTO v_day_count, v_distinct_day_count
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      );

    IF v_day_count <> 7 OR v_distinct_day_count <> 7 THEN
        RAISE EXCEPTION 'Schedule must contain each day from 0 through 6 exactly once' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)
      INTO v_invalid_count
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      )
     WHERE day_of_week NOT BETWEEN 0 AND 6
        OR is_working_day IS NULL
        OR work_start IS NULL
        OR work_end IS NULL
        OR work_start >= work_end
        OR ((break_start IS NULL) <> (break_end IS NULL))
        OR (break_start IS NOT NULL AND (
               break_start >= break_end
            OR break_start < work_start
            OR break_end > work_end
        ));

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Invalid work or break time in weekly schedule' USING ERRCODE = '22023';
    END IF;

    INSERT INTO local_service.staff_schedules (
        shop_id, staff_id, day_of_week, is_working_day,
        work_start, work_end, break_start, break_end
    )
    SELECT
        v_shop_id, p_staff_id, day_of_week, is_working_day,
        work_start, work_end, break_start, break_end
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      )
    ON CONFLICT (staff_id, day_of_week) DO UPDATE
        SET shop_id = EXCLUDED.shop_id,
            is_working_day = EXCLUDED.is_working_day,
            work_start = EXCLUDED.work_start,
            work_end = EXCLUDED.work_end,
            break_start = EXCLUDED.break_start,
            break_end = EXCLUDED.break_end;
END;
$$;

REVOKE ALL ON FUNCTION local_service.enforce_shop_weekly_booking_hours()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION local_service.upsert_staff_weekly_schedule(uuid,jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.upsert_staff_weekly_schedule(uuid,jsonb) TO authenticated;

COMMIT;