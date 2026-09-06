-- Fix: a service with deposit_amount = 0 should mean "no deposit for this
-- service", not silently fall back to the shop's default_deposit_amount.
-- Previously the RPC checked `> 0`, so an explicit 0 was indistinguishable
-- from "not set" and always inherited the shop default. Switch to IS NOT
-- NULL so any explicit value (including 0) wins.
-- Date: 2026-08-07

CREATE OR REPLACE FUNCTION local_service.create_booking_hold(
    p_shop_id UUID,
    p_service_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_customer_name VARCHAR DEFAULT '',
    p_customer_phone VARCHAR DEFAULT '',
    p_customer_email VARCHAR DEFAULT NULL,
    p_booking_date DATE DEFAULT CURRENT_DATE,
    p_start_time TIME DEFAULT '09:00:00',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_service RECORD;
    v_shop RECORD;
    v_customer_id UUID;
    v_chosen_staff_id UUID := p_staff_id;
    v_deposit_required BOOLEAN;
    v_deposit_amount NUMERIC(10,2) := 0.00;
    v_status VARCHAR(50);
    v_deposit_status VARCHAR(50);
    v_expires_at TIMESTAMPTZ;
    v_booking_code VARCHAR(20);
    v_link_token VARCHAR(10);
    v_start_tz TIMESTAMPTZ;
    v_end_tz TIMESTAMPTZ;
    v_booking_id UUID;
    v_day_of_week INTEGER;
    v_end_time TIME;
BEGIN
    SELECT * INTO v_service FROM local_service.services
    WHERE id = p_service_id AND shop_id = p_shop_id AND is_active = true;
    IF v_service.id IS NULL THEN RAISE EXCEPTION 'Service not found or inactive'; END IF;

    SELECT * INTO v_shop FROM local_service.shops
    WHERE id = p_shop_id AND is_active = true;
    IF v_shop.id IS NULL THEN RAISE EXCEPTION 'Shop not found or inactive'; END IF;

    IF EXISTS (
        SELECT 1 FROM local_service.shop_holidays h
        WHERE h.shop_id = p_shop_id AND h.staff_id IS NULL AND h.holiday_date = p_booking_date
    ) THEN
        RAISE EXCEPTION 'Shop is closed on the requested date';
    END IF;

    v_start_tz := (p_booking_date || ' ' || p_start_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end_tz := v_start_tz + (v_service.duration_minutes || ' minutes')::interval;
    v_end_time := (p_start_time + (v_service.duration_minutes || ' minutes')::interval)::time;
    v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

    v_deposit_required := COALESCE(v_shop.require_deposit, true);
    IF v_deposit_required THEN
        IF v_service.deposit_amount IS NOT NULL THEN
            v_deposit_amount := v_service.deposit_amount;
        ELSIF v_shop.default_deposit_amount > 0 THEN
            v_deposit_amount := v_shop.default_deposit_amount;
        ELSE
            v_deposit_required := false;
        END IF;
    END IF;

    IF v_deposit_required AND v_deposit_amount > 0 THEN
        v_status := 'hold';
        v_deposit_status := 'awaiting';
        v_expires_at := NOW() + INTERVAL '15 minutes';
    ELSE
        v_status := 'confirmed';
        v_deposit_status := 'not_required';
        v_expires_at := NULL;
        v_deposit_amount := 0.00;
    END IF;

    IF v_chosen_staff_id IS NULL THEN
        SELECT st.id INTO v_chosen_staff_id
        FROM local_service.staff st
        WHERE st.shop_id = p_shop_id AND st.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM local_service.shop_holidays h
              WHERE h.shop_id = p_shop_id AND h.staff_id = st.id AND h.holiday_date = p_booking_date
          )
          AND NOT EXISTS (
              SELECT 1 FROM local_service.staff_schedules s
              WHERE s.staff_id = st.id AND s.day_of_week = v_day_of_week
                AND (
                    NOT COALESCE(s.is_working_day, false)
                    OR p_start_time < s.work_start OR v_end_time > s.work_end
                    OR (s.break_start IS NOT NULL AND s.break_end IS NOT NULL
                        AND p_start_time < s.break_end AND v_end_time > s.break_start)
                )
          )
          AND NOT EXISTS (
              SELECT 1 FROM local_service.bookings b
              WHERE b.staff_id = st.id
                AND b.status IN ('hold', 'pending_review', 'confirmed')
                AND (b.expires_at IS NULL OR b.expires_at > NOW())
                AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)')
                    && tstzrange(v_start_tz, v_end_tz, '[)')
          )
        ORDER BY (
            SELECT COUNT(*) FROM local_service.bookings b2
            WHERE b2.staff_id = st.id AND b2.booking_date = p_booking_date
              AND b2.status IN ('hold', 'pending_review', 'confirmed')
        ) ASC, st.created_at ASC
        LIMIT 1;

        IF v_chosen_staff_id IS NULL THEN
            RAISE EXCEPTION 'No available staff for the requested time slot';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM local_service.staff st
            WHERE st.id = v_chosen_staff_id AND st.shop_id = p_shop_id AND st.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected staff not found or inactive';
        END IF;
        IF EXISTS (
            SELECT 1 FROM local_service.shop_holidays h
            WHERE h.shop_id = p_shop_id AND h.staff_id = v_chosen_staff_id
              AND h.holiday_date = p_booking_date
        ) THEN
            RAISE EXCEPTION 'Selected staff is off on the requested date';
        END IF;
        IF EXISTS (
            SELECT 1 FROM local_service.staff_schedules s
            WHERE s.staff_id = v_chosen_staff_id AND s.day_of_week = v_day_of_week
              AND (
                  NOT COALESCE(s.is_working_day, false)
                  OR p_start_time < s.work_start OR v_end_time > s.work_end
                  OR (s.break_start IS NOT NULL AND s.break_end IS NOT NULL
                      AND p_start_time < s.break_end AND v_end_time > s.break_start)
              )
        ) THEN
            RAISE EXCEPTION 'Selected staff is outside working hours or on a break';
        END IF;
        IF EXISTS (
            SELECT 1 FROM local_service.bookings b
            WHERE b.staff_id = v_chosen_staff_id
              AND b.status IN ('hold', 'pending_review', 'confirmed')
              AND (b.expires_at IS NULL OR b.expires_at > NOW())
              AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)')
                  && tstzrange(v_start_tz, v_end_tz, '[)')
        ) THEN
            RAISE EXCEPTION 'Selected staff is unavailable during this time slot';
        END IF;
    END IF;

    INSERT INTO local_service.customers (shop_id, name, phone, email)
    VALUES (p_shop_id, p_customer_name, p_customer_phone, p_customer_email)
    ON CONFLICT (shop_id, phone)
    DO UPDATE SET name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, local_service.customers.email)
    RETURNING id INTO v_customer_id;

    v_booking_code := local_service.generate_booking_code();
    v_link_token := local_service.generate_link_token();

    INSERT INTO local_service.bookings (
        shop_id, customer_id, staff_id, service_id, booking_code, link_token,
        link_token_expires_at, booking_date, start_time, end_time,
        start_timestamptz, end_timestamptz, status, deposit_status,
        service_price, service_duration_minutes, deposit_amount, total_price,
        deposit_price, expires_at, notes
    ) VALUES (
        p_shop_id, v_customer_id, v_chosen_staff_id, p_service_id, v_booking_code, v_link_token,
        NOW() + INTERVAL '24 hours', p_booking_date, p_start_time, v_end_time,
        v_start_tz, v_end_tz, v_status, v_deposit_status,
        v_service.price, v_service.duration_minutes, v_deposit_amount, v_service.price,
        v_deposit_amount, v_expires_at, p_notes
    ) RETURNING id INTO v_booking_id;

    RETURN json_build_object(
        'booking_id', v_booking_id,
        'booking_code', v_booking_code,
        'link_token', v_link_token,
        'status', v_status,
        'deposit_status', v_deposit_status,
        'deposit_amount', v_deposit_amount,
        'total_price', v_service.price,
        'expires_at', v_expires_at,
        'staff_id', v_chosen_staff_id
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.create_booking_hold(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, DATE, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION local_service.create_booking_hold(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, DATE, TIME, TEXT) TO anon, authenticated, service_role;
