-- Migration: Phase A data integrity and authorization hardening
-- Date: 2026-08-07

-- Expired holds must leave the constraint predicate before the exclusion
-- constraint is created. Future booking attempts also expire overlapping
-- stale holds inside create_booking_hold before selecting a staff member.
UPDATE local_service.bookings
SET status = 'expired',
    updated_at = NOW()
WHERE status = 'hold'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW();

ALTER TABLE local_service.bookings
DROP CONSTRAINT IF EXISTS prevent_overlapping_staff_bookings;

ALTER TABLE local_service.bookings
ADD CONSTRAINT prevent_overlapping_staff_bookings
EXCLUDE USING gist (
    staff_id WITH =,
    booking_range WITH &&
)
WHERE (status IN ('hold', 'pending_review', 'confirmed'));

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
    v_constraint_name TEXT;
BEGIN
    IF NULLIF(btrim(p_customer_name), '') IS NULL THEN
        RAISE EXCEPTION 'Customer name is required';
    END IF;
    IF NULLIF(btrim(p_customer_phone), '') IS NULL THEN
        RAISE EXCEPTION 'Customer phone is required';
    END IF;
    IF p_booking_date IS NULL OR p_booking_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Booking date must be today or later';
    END IF;

    SELECT * INTO v_service
    FROM local_service.services
    WHERE id = p_service_id
      AND shop_id = p_shop_id
      AND is_active = true;
    IF v_service.id IS NULL THEN
        RAISE EXCEPTION 'Service not found or inactive';
    END IF;

    SELECT * INTO v_shop
    FROM local_service.shops
    WHERE id = p_shop_id
      AND is_active = true;
    IF v_shop.id IS NULL THEN
        RAISE EXCEPTION 'Shop not found or inactive';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM local_service.shop_holidays h
        WHERE h.shop_id = p_shop_id
          AND h.staff_id IS NULL
          AND h.holiday_date = p_booking_date
    ) THEN
        RAISE EXCEPTION 'Shop is closed on the requested date';
    END IF;

    v_start_tz := (p_booking_date || ' ' || p_start_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end_tz := v_start_tz + (v_service.duration_minutes || ' minutes')::interval;
    v_end_time := (p_start_time + (v_service.duration_minutes || ' minutes')::interval)::time;
    v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

    UPDATE local_service.bookings
    SET status = 'expired',
        updated_at = NOW()
    WHERE shop_id = p_shop_id
      AND status = 'hold'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
      AND tstzrange(start_timestamptz, end_timestamptz, '[)')
          && tstzrange(v_start_tz, v_end_tz, '[)');

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
        WHERE st.shop_id = p_shop_id
          AND st.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM local_service.shop_holidays h
              WHERE h.shop_id = p_shop_id
                AND h.staff_id = st.id
                AND h.holiday_date = p_booking_date
          )
          AND NOT EXISTS (
              SELECT 1
              FROM local_service.staff_schedules s
              WHERE s.staff_id = st.id
                AND s.day_of_week = v_day_of_week
                AND (
                    NOT COALESCE(s.is_working_day, false)
                    OR p_start_time < s.work_start
                    OR v_end_time > s.work_end
                    OR (
                        s.break_start IS NOT NULL
                        AND s.break_end IS NOT NULL
                        AND p_start_time < s.break_end
                        AND v_end_time > s.break_start
                    )
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM local_service.bookings b
              WHERE b.staff_id = st.id
                AND b.status IN ('hold', 'pending_review', 'confirmed')
                AND (b.expires_at IS NULL OR b.expires_at > NOW())
                AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)')
                    && tstzrange(v_start_tz, v_end_tz, '[)')
          )
        ORDER BY (
            SELECT COUNT(*)
            FROM local_service.bookings b2
            WHERE b2.staff_id = st.id
              AND b2.booking_date = p_booking_date
              AND b2.status IN ('hold', 'pending_review', 'confirmed')
        ) ASC, st.created_at ASC
        LIMIT 1;

        IF v_chosen_staff_id IS NULL THEN
            RAISE EXCEPTION 'No available staff for the requested time slot';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM local_service.staff st
            WHERE st.id = v_chosen_staff_id
              AND st.shop_id = p_shop_id
              AND st.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected staff not found or inactive';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM local_service.shop_holidays h
            WHERE h.shop_id = p_shop_id
              AND h.staff_id = v_chosen_staff_id
              AND h.holiday_date = p_booking_date
        ) THEN
            RAISE EXCEPTION 'Selected staff is off on the requested date';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM local_service.staff_schedules s
            WHERE s.staff_id = v_chosen_staff_id
              AND s.day_of_week = v_day_of_week
              AND (
                  NOT COALESCE(s.is_working_day, false)
                  OR p_start_time < s.work_start
                  OR v_end_time > s.work_end
                  OR (
                      s.break_start IS NOT NULL
                      AND s.break_end IS NOT NULL
                      AND p_start_time < s.break_end
                      AND v_end_time > s.break_start
                  )
              )
        ) THEN
            RAISE EXCEPTION 'Selected staff is outside working hours or on a break';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM local_service.bookings b
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
    VALUES (
        p_shop_id,
        btrim(p_customer_name),
        btrim(p_customer_phone),
        p_customer_email
    )
    ON CONFLICT (shop_id, phone)
    DO UPDATE SET name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, local_service.customers.email)
    RETURNING id INTO v_customer_id;

    v_booking_code := local_service.generate_booking_code();
    v_link_token := local_service.generate_link_token();

    BEGIN
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
        )
        RETURNING id INTO v_booking_id;
    EXCEPTION
        WHEN exclusion_violation THEN
            GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
            IF v_constraint_name = 'prevent_overlapping_staff_bookings' THEN
                RAISE EXCEPTION USING
                    ERRCODE = 'P0001',
                    MESSAGE = 'Selected staff is unavailable during this time slot';
            END IF;
            RAISE;
    END;

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
    v_expected_pattern TEXT;
    v_object_name TEXT;
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

    v_expected_pattern :=
        '^https://gyleqrjdzwwlqierdwcy[.]supabase[.]co/storage/v1/object/public/deposit-slips/'
        || p_booking_id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$';

    IF p_slip_url !~* v_expected_pattern THEN
        RAISE EXCEPTION 'Slip URL must belong to this booking in the deposit-slips bucket';
    END IF;

    v_object_name := regexp_replace(
        p_slip_url,
        '^https://gyleqrjdzwwlqierdwcy[.]supabase[.]co/storage/v1/object/public/deposit-slips/',
        '',
        'i'
    );

    IF NOT EXISTS (
        SELECT 1
        FROM storage.objects o
        WHERE o.bucket_id = 'deposit-slips'
          AND o.name = v_object_name
    ) THEN
        RAISE EXCEPTION 'Slip object was not found in the deposit-slips bucket';
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

CREATE OR REPLACE FUNCTION local_service.extend_booking_hold(p_booking_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking
    FROM local_service.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;
    IF auth.uid() IS NULL OR NOT local_service.is_shop_member(v_booking.shop_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Not authorized for this shop';
    END IF;
    IF v_booking.status <> 'hold' THEN
        RAISE EXCEPTION 'Only hold bookings can be extended';
    END IF;
    IF v_booking.expires_at IS NULL OR v_booking.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Booking hold has expired';
    END IF;
    IF v_booking.hold_extended THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Hold already extended once',
            'expires_at', v_booking.expires_at
        );
    END IF;

    UPDATE local_service.bookings
    SET expires_at = expires_at + INTERVAL '5 minutes',
        hold_extended = true,
        updated_at = NOW()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    RETURN json_build_object(
        'success', true,
        'message', 'Hold extended by 5 minutes',
        'expires_at', v_booking.expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.extend_booking_hold(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION local_service.extend_booking_hold(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION local_service.extend_booking_hold(UUID) FROM service_role;
GRANT EXECUTE ON FUNCTION local_service.extend_booking_hold(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION local_service.reject_deposit_slip(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking
    FROM local_service.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;
    IF auth.uid() IS NULL OR NOT local_service.is_shop_member(v_booking.shop_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Not authorized for this shop';
    END IF;
    IF v_booking.status <> 'pending_review' OR v_booking.deposit_status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted deposit slips can be rejected';
    END IF;

    UPDATE local_service.bookings
    SET status = 'hold',
        deposit_status = 'rejected',
        expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Keep a dedicated reason-bearing audit row. The generic AFTER UPDATE
    -- trigger row is intentionally preserved, so each rejection has two rows.
    INSERT INTO local_service.booking_status_history (
        booking_id,
        old_status,
        new_status,
        old_deposit_status,
        new_deposit_status,
        changed_by,
        reason
    ) VALUES (
        p_booking_id,
        v_booking.status,
        'hold',
        v_booking.deposit_status,
        'rejected',
        auth.uid(),
        COALESCE(NULLIF(btrim(p_reason), ''), 'Slip Rejected by Shop')
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Slip rejected, hold reset to 15 minutes'
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.reject_deposit_slip(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION local_service.reject_deposit_slip(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION local_service.reject_deposit_slip(UUID, TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION local_service.reject_deposit_slip(UUID, TEXT) TO authenticated;

-- Public booking creation must go through create_booking_hold so its input,
-- deposit, holiday, schedule, and overlap checks cannot be bypassed.
REVOKE INSERT ON TABLE local_service.customers FROM PUBLIC, anon;
REVOKE INSERT ON TABLE local_service.bookings FROM PUBLIC, anon;
