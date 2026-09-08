-- Migration: Secure deposit slip submission, storage, and booking availability guards
-- Date: 2026-08-07

-- Public-by-URL image bucket. Anonymous users cannot list objects and can only
-- create randomized booking-scoped image paths.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'deposit-slips', 'deposit-slips', true, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anonymous users upload deposit slips" ON storage.objects;
CREATE POLICY "Anonymous users upload deposit slips"
ON storage.objects FOR INSERT TO anon
WITH CHECK (
    bucket_id = 'deposit-slips'
    AND name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
);

CREATE OR REPLACE FUNCTION local_service.submit_deposit_slip(
    p_booking_id UUID,
    p_slip_url TEXT,
    p_trans_ref TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
BEGIN
    IF p_slip_url IS NULL OR btrim(p_slip_url) = '' THEN
        RAISE EXCEPTION 'Slip URL is required';
    END IF;

    SELECT * INTO v_booking
    FROM local_service.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;
    IF v_booking.status <> 'hold' THEN
        RAISE EXCEPTION 'Booking is not accepting deposit slips';
    END IF;
    IF v_booking.expires_at IS NULL OR v_booking.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Booking hold has expired';
    END IF;

    UPDATE local_service.bookings
    SET slip_url = p_slip_url,
        trans_ref = NULLIF(btrim(p_trans_ref), ''),
        deposit_status = 'submitted',
        status = 'pending_review',
        slip_uploaded_at = NOW(),
        slip_submit_count = COALESCE(slip_submit_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN json_build_object(
        'booking_id', v_booking.id,
        'status', v_booking.status,
        'deposit_status', v_booking.deposit_status,
        'slip_url', v_booking.slip_url,
        'slip_uploaded_at', v_booking.slip_uploaded_at,
        'slip_submit_count', v_booking.slip_submit_count
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.submit_deposit_slip(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION local_service.submit_deposit_slip(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

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
        IF v_service.deposit_amount > 0 THEN
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
