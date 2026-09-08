-- Migration: Product Rules V1 Specification & Database Engine Refactoring
-- Date: 2026-08-06
-- Target Project: Local Service Booking & LINE Automation SaaS
-- SSOT: PRODUCT_RULES_V1.md

CREATE SCHEMA IF NOT EXISTS local_service;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. STATUS AUDIT HISTORY TABLE
CREATE TABLE IF NOT EXISTS local_service.booking_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    old_deposit_status VARCHAR(50),
    new_deposit_status VARCHAR(50),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ALTER BOOKINGS TABLE SCHEMA TO ALIGN WITH PRODUCT_RULES_V1
-- Drop old status check constraints if existing
DO $$
BEGIN
    ALTER TABLE local_service.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE local_service.bookings DROP CONSTRAINT IF EXISTS bookings_deposit_status_check;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Update column definitions & add missing 2-axis columns
ALTER TABLE local_service.bookings 
    ALTER COLUMN status SET DEFAULT 'hold',
    ALTER COLUMN deposit_status SET DEFAULT 'awaiting';

-- Add Check constraints for 2-axis status
ALTER TABLE local_service.bookings
    ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('hold', 'pending_review', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired')),
    ADD CONSTRAINT bookings_deposit_status_check 
    CHECK (deposit_status IN ('not_required', 'awaiting', 'submitted', 'verified', 'rejected', 'refunded'));

-- Add missing structural columns
ALTER TABLE local_service.bookings
    ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS link_token VARCHAR(10),
    ADD COLUMN IF NOT EXISTS link_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
    ADD COLUMN IF NOT EXISTS hold_extended BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS trans_ref VARCHAR(100),
    ADD COLUMN IF NOT EXISTS slip_submit_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS slip_uploaded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS service_price NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS service_duration_minutes INT,
    ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS start_timestamptz TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_timestamptz TIMESTAMPTZ;

-- Add generated column for Exclusion Constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'local_service' AND table_name = 'bookings' AND column_name = 'booking_range'
    ) THEN
        ALTER TABLE local_service.bookings 
        ADD COLUMN booking_range TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_timestamptz, end_timestamptz, '[)')) STORED;
    END IF;
END $$;

-- FK link for booking_status_history
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'booking_status_history_booking_id_fkey'
    ) THEN
        ALTER TABLE local_service.booking_status_history
        ADD CONSTRAINT booking_status_history_booking_id_fkey
        FOREIGN KEY (booking_id) REFERENCES local_service.bookings(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. SYSTEM-WIDE UNIQUE INDEX ON TRANS_REF (SLIP ANTI-REUSE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_trans_ref 
ON local_service.bookings(trans_ref) 
WHERE trans_ref IS NOT NULL AND trans_ref != '';

-- Index for booking code and expires_at
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON local_service.bookings(booking_code);
CREATE INDEX IF NOT EXISTS idx_bookings_expires_at ON local_service.bookings(expires_at) WHERE status = 'hold';

-- 5. POSTGRES EXCLUSION CONSTRAINT (PREVENT DOUBLE-BOOKING)
DO $$
BEGIN
    ALTER TABLE local_service.bookings DROP CONSTRAINT IF EXISTS prevent_overlapping_staff_bookings;
    ALTER TABLE local_service.bookings
    ADD CONSTRAINT prevent_overlapping_staff_bookings
    EXCLUDE USING gist (
        staff_id WITH =,
        booking_range WITH &&
    ) WHERE (status IN ('hold', 'pending_review', 'confirmed') AND (expires_at IS NULL OR expires_at > NOW()));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Constraint setup warning: %', SQLERRM;
END $$;

-- 6. GLOBAL UNIQUE BOOKING CODE GENERATOR FUNCTION
CREATE OR REPLACE FUNCTION local_service.generate_booking_code()
RETURNS TEXT AS $$
DECLARE
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Exclude 0, O, 1, I, L, Q
    v_code TEXT;
    v_exists BOOLEAN;
    v_i INT;
BEGIN
    LOOP
        v_code := 'BK-';
        FOR v_i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;
        
        SELECT EXISTS (
            SELECT 1 FROM local_service.bookings WHERE booking_code = v_code
        ) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. GENERATE LINK TOKEN FUNCTION
CREATE OR REPLACE FUNCTION local_service.generate_link_token()
RETURNS TEXT AS $$
DECLARE
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_token TEXT := '';
    v_i INT;
BEGIN
    FOR v_i IN 1..4 LOOP
        v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    RETURN v_token;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 8. STATE MACHINE TRANSITION ENFORCER & AUDIT TRIGGER
CREATE OR REPLACE FUNCTION local_service.enforce_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- On INSERT: skip transition check, just log history
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, NULL, NEW.status, NULL, NEW.deposit_status, v_user_id, 'Initial Booking Created'
        );
        RETURN NEW;
    END IF;

    -- On UPDATE: validate state transition if status changed
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Validation Matrix
        IF (OLD.status = 'hold' AND NEW.status NOT IN ('pending_review', 'confirmed', 'cancelled', 'expired')) THEN
            RAISE EXCEPTION 'Invalid status transition from hold to %', NEW.status;
        ELSIF (OLD.status = 'pending_review' AND NEW.status NOT IN ('confirmed', 'hold', 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid status transition from pending_review to %', NEW.status;
        ELSIF (OLD.status = 'confirmed' AND NEW.status NOT IN ('completed', 'cancelled', 'no_show')) THEN
            RAISE EXCEPTION 'Invalid status transition from confirmed to %', NEW.status;
        ELSIF (OLD.status IN ('completed', 'cancelled', 'no_show', 'expired')) THEN
            RAISE EXCEPTION 'Terminal state % cannot be transitioned to %', OLD.status, NEW.status;
        END IF;

        -- Record Audit History
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, OLD.status, NEW.status, OLD.deposit_status, NEW.deposit_status, v_user_id, 'Status Update'
        );
    ELSIF (OLD.deposit_status IS DISTINCT FROM NEW.deposit_status) THEN
        -- Record Deposit Status Audit History
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, OLD.status, NEW.status, OLD.deposit_status, NEW.deposit_status, v_user_id, 'Deposit Status Update'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to bookings table
DROP TRIGGER IF EXISTS trg_enforce_booking_status_transition ON local_service.bookings;
CREATE TRIGGER trg_enforce_booking_status_transition
    BEFORE INSERT OR UPDATE ON local_service.bookings
    FOR EACH ROW
    EXECUTE FUNCTION local_service.enforce_booking_status_transition();

-- 9. RPC FUNCTION: CREATE_BOOKING_HOLD (CORE ATOMIC RESERVATION)
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
RETURNS JSON AS $$
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
    v_result JSON;
BEGIN
    -- 1. Fetch Service & Shop Details
    SELECT * INTO v_service FROM local_service.services WHERE id = p_service_id AND shop_id = p_shop_id AND is_active = true;
    IF v_service.id IS NULL THEN
        RAISE EXCEPTION 'Service not found or inactive';
    END IF;

    SELECT * INTO v_shop FROM local_service.shops WHERE id = p_shop_id AND is_active = true;
    IF v_shop.id IS NULL THEN
        RAISE EXCEPTION 'Shop not found or inactive';
    END IF;

    -- 2. Calculate Timestamps in Asia/Bangkok
    v_start_tz := (p_booking_date || ' ' || p_start_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end_tz := v_start_tz + (v_service.duration_minutes || ' minutes')::interval;

    -- 3. Calculate Deposit Requirement
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

    -- 4. Allocate Staff if "Anyone" (p_staff_id IS NULL)
    IF v_chosen_staff_id IS NULL THEN
        SELECT st.id INTO v_chosen_staff_id
        FROM local_service.staff st
        WHERE st.shop_id = p_shop_id 
          AND st.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM local_service.bookings b
              WHERE b.staff_id = st.id
                AND b.status IN ('hold', 'pending_review', 'confirmed')
                AND (b.expires_at IS NULL OR b.expires_at > NOW())
                AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)') && tstzrange(v_start_tz, v_end_tz, '[)')
          )
        ORDER BY (
            SELECT COUNT(*) FROM local_service.bookings b2 
            WHERE b2.staff_id = st.id 
              AND b2.booking_date = p_booking_date 
              AND b2.status IN ('hold', 'pending_review', 'confirmed')
        ) ASC, st.created_at ASC
        LIMIT 1;

        IF v_chosen_staff_id IS NULL THEN
            RAISE EXCEPTION 'No available staff for the requested time slot';
        END IF;
    ELSE
        -- Validate chosen staff availability
        IF EXISTS (
            SELECT 1 FROM local_service.bookings b
            WHERE b.staff_id = v_chosen_staff_id
              AND b.status IN ('hold', 'pending_review', 'confirmed')
              AND (b.expires_at IS NULL OR b.expires_at > NOW())
              AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)') && tstzrange(v_start_tz, v_end_tz, '[)')
        ) THEN
            RAISE EXCEPTION 'Selected staff is unavailable during this time slot';
        END IF;
    END IF;

    -- 5. Customer Upsert
    INSERT INTO local_service.customers (shop_id, name, phone, email)
    VALUES (p_shop_id, p_customer_name, p_customer_phone, p_customer_email)
    ON CONFLICT (shop_id, phone) 
    DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, local_service.customers.email)
    RETURNING id INTO v_customer_id;

    -- 6. Generate Codes
    v_booking_code := local_service.generate_booking_code();
    v_link_token := local_service.generate_link_token();

    -- 7. Insert Booking Record
    INSERT INTO local_service.bookings (
        shop_id,
        customer_id,
        staff_id,
        service_id,
        booking_code,
        link_token,
        link_token_expires_at,
        booking_date,
        start_time,
        end_time,
        start_timestamptz,
        end_timestamptz,
        status,
        deposit_status,
        service_price,
        service_duration_minutes,
        deposit_amount,
        total_price,
        deposit_price,
        expires_at,
        notes
    ) VALUES (
        p_shop_id,
        v_customer_id,
        v_chosen_staff_id,
        p_service_id,
        v_booking_code,
        v_link_token,
        NOW() + INTERVAL '24 hours',
        p_booking_date,
        p_start_time,
        (p_start_time + (v_service.duration_minutes || ' minutes')::interval),
        v_start_tz,
        v_end_tz,
        v_status,
        v_deposit_status,
        v_service.price,
        v_service.duration_minutes,
        v_deposit_amount,
        v_service.price,
        v_deposit_amount,
        v_expires_at,
        p_notes
    ) RETURNING id INTO v_booking_id;

    -- 8. Return Response Object
    v_result := json_build_object(
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

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC HELPER: EXTEND_BOOKING_HOLD
CREATE OR REPLACE FUNCTION local_service.extend_booking_hold(p_booking_id UUID)
RETURNS JSON AS $$
DECLARE
    v_booking RECORD;
BEGIN
    SELECT * INTO v_booking FROM local_service.bookings WHERE id = p_booking_id;
    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF v_booking.status != 'hold' THEN
        RAISE EXCEPTION 'Only hold bookings can be extended';
    END IF;

    IF v_booking.hold_extended THEN
        RETURN json_build_object('success', false, 'message', 'Hold already extended once', 'expires_at', v_booking.expires_at);
    END IF;

    UPDATE local_service.bookings
    SET expires_at = expires_at + INTERVAL '5 minutes',
        hold_extended = true,
        updated_at = NOW()
    WHERE id = p_booking_id;

    RETURN json_build_object('success', true, 'message', 'Hold extended by 5 minutes', 'expires_at', v_booking.expires_at + INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC HELPER: REJECT_DEPOSIT_SLIP
CREATE OR REPLACE FUNCTION local_service.reject_deposit_slip(p_booking_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    v_booking RECORD;
BEGIN
    SELECT * INTO v_booking FROM local_service.bookings WHERE id = p_booking_id;
    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    UPDATE local_service.bookings
    SET status = 'hold',
        deposit_status = 'rejected',
        expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    WHERE id = p_booking_id;

    INSERT INTO local_service.booking_status_history (
        booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
    ) VALUES (
        p_booking_id, v_booking.status, 'hold', v_booking.deposit_status, 'rejected', auth.uid(), COALESCE(p_reason, 'Slip Rejected by Shop')
    );

    RETURN json_build_object('success', true, 'message', 'Slip rejected, hold reset to 15 minutes');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. RLS POLICIES FOR SECURITY
ALTER TABLE local_service.booking_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view status history"
ON local_service.booking_status_history FOR ALL
USING (local_service.is_shop_member((SELECT shop_id FROM local_service.bookings WHERE id = booking_id)));

-- Grant schema permissions
GRANT USAGE ON SCHEMA local_service TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA local_service TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA local_service TO anon, authenticated, service_role;
