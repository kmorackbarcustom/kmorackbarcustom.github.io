-- Phase E3.2: role-aware staff schedules and shop holiday management.

ALTER TABLE local_service.shop_holidays
    ADD COLUMN IF NOT EXISTS creation_idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS shop_holidays_shop_creation_idempotency_key
    ON local_service.shop_holidays (shop_id, creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shop_holidays_shop_wide_date
    ON local_service.shop_holidays (shop_id, holiday_date)
    WHERE staff_id IS NULL;

-- Public availability reads stay intact. Authenticated writes must use the
-- role-aware RPCs below instead of the broad legacy member policies.
GRANT SELECT ON TABLE local_service.staff_schedules, local_service.shop_holidays TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.staff_schedules, local_service.shop_holidays FROM authenticated;

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

CREATE OR REPLACE FUNCTION local_service.create_shop_holiday(
    p_shop_id UUID,
    p_holiday_date DATE,
    p_reason TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_holiday_id UUID;
BEGIN
    IF NOT local_service.has_shop_role(p_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_holiday_date IS NULL THEN
        RAISE EXCEPTION 'Holiday date is required' USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    SELECT id
      INTO v_holiday_id
      FROM local_service.shop_holidays
     WHERE shop_id = p_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_holiday_id IS NOT NULL THEN
        RETURN v_holiday_id;
    END IF;

    SELECT id
      INTO v_holiday_id
      FROM local_service.shop_holidays
     WHERE shop_id = p_shop_id
       AND staff_id IS NULL
       AND holiday_date = p_holiday_date;

    IF v_holiday_id IS NOT NULL THEN
        RETURN v_holiday_id;
    END IF;

    INSERT INTO local_service.shop_holidays (
        shop_id, staff_id, holiday_date, reason, creation_idempotency_key
    ) VALUES (
        p_shop_id, NULL, p_holiday_date,
        COALESCE(NULLIF(BTRIM(p_reason), ''), 'วันหยุดพิเศษร้านค้า'),
        p_idempotency_key
    )
    RETURNING id INTO v_holiday_id;

    RETURN v_holiday_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.delete_shop_holiday(p_holiday_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_staff_id UUID;
BEGIN
    SELECT shop_id, staff_id
      INTO v_shop_id, v_staff_id
      FROM local_service.shop_holidays
     WHERE id = p_holiday_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop holiday not found';
    END IF;

    IF v_staff_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only shop-wide holidays can be managed here' USING ERRCODE = '22023';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    DELETE FROM local_service.shop_holidays WHERE id = p_holiday_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.upsert_staff_weekly_schedule(UUID, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.upsert_staff_weekly_schedule(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION local_service.create_shop_holiday(UUID, DATE, TEXT, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.create_shop_holiday(UUID, DATE, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION local_service.delete_shop_holiday(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.delete_shop_holiday(UUID) TO authenticated;
