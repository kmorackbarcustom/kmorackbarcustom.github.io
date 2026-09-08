-- Migration: Quota, Staff Limit, and Top-up Credits Enforcement
-- Date: 2026-08-19
-- Target Schema: local_service
-- SSOT: docs/business/PRICING_SPEC.md & PRODUCT_RULES_V1.md §6

-- ============================================================================
-- A. TABLE: local_service.entitlement_usage (Ledger ตารางบันทึกการใช้งานโควตา)
-- ============================================================================

CREATE TABLE IF NOT EXISTS local_service.entitlement_usage (
    shop_id UUID PRIMARY KEY REFERENCES local_service.shops(id) ON DELETE CASCADE,
    bookings_used INTEGER NOT NULL DEFAULT 0,
    bookings_topup_balance INTEGER NOT NULL DEFAULT 0,
    auto_slip_used INTEGER NOT NULL DEFAULT 0,
    auto_slip_topup_balance INTEGER NOT NULL DEFAULT 0,
    period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_usage_shop_id ON local_service.entitlement_usage(shop_id);

ALTER TABLE local_service.entitlement_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE local_service.entitlement_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE local_service.entitlement_usage TO service_role;

-- ============================================================================
-- B. HELPER: local_service.get_tier_limits (ฟังก์ชันคำนวณขีดจำกัดตาม Tier แพ็กเกจ)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.get_tier_limits(
    p_plan TEXT
)
RETURNS TABLE(
    bookings_limit INT,
    staff_limit INT,
    auto_slip_limit INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT
        CASE p_plan
            WHEN 'basic_490' THEN 100
            WHEN 'pro_990' THEN 500
            ELSE 50 -- free_trial หรือแพ็กเกจที่ไม่ระบุ (Fail-closed)
        END AS bookings_limit,
        CASE p_plan
            WHEN 'pro_990' THEN 10
            ELSE 5 -- free_trial, basic_490, หรือแพ็กเกจที่ไม่ระบุ (Fail-closed)
        END AS staff_limit,
        CASE p_plan
            WHEN 'basic_490' THEN 0
            WHEN 'pro_990' THEN 100
            ELSE 10 -- free_trial หรือแพ็กเกจที่ไม่ระบุ (Fail-closed)
        END AS auto_slip_limit;
$$;

REVOKE ALL ON FUNCTION local_service.get_tier_limits(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.get_tier_limits(TEXT) TO authenticated;

-- ============================================================================
-- C. HELPER: local_service.ensure_entitlement_row (ฟังก์ชันสร้างและรีเซ็ต Ledger ตามรอบบิล)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.ensure_entitlement_row(
    p_shop_id UUID
)
RETURNS local_service.entitlement_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_plan TEXT := 'free_trial';
    v_sub_period_end TIMESTAMPTZ;
    v_usage local_service.entitlement_usage%ROWTYPE;
BEGIN
    -- 1. ตรวจสอบข้อมูล subscription และ current_period_end ของร้าน
    SELECT COALESCE(s.plan, 'free_trial'), s.current_period_end
      INTO v_plan, v_sub_period_end
      FROM local_service.subscriptions s
     WHERE s.shop_id = p_shop_id;

    IF NOT FOUND THEN
        v_plan := 'free_trial';
        v_sub_period_end := NULL;
    END IF;

    -- 2. ดึงหรือสร้างแถว entitlement_usage พร้อมล็อก FOR UPDATE
    SELECT *
      INTO v_usage
      FROM local_service.entitlement_usage
     WHERE shop_id = p_shop_id
       FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO local_service.entitlement_usage (
            shop_id,
            bookings_used,
            bookings_topup_balance,
            auto_slip_used,
            auto_slip_topup_balance,
            period_end,
            updated_at
        ) VALUES (
            p_shop_id,
            0,
            0,
            0,
            0,
            v_sub_period_end,
            now()
        )
        ON CONFLICT (shop_id) DO NOTHING;

        SELECT *
          INTO v_usage
          FROM local_service.entitlement_usage
         WHERE shop_id = p_shop_id
           FOR UPDATE;
    END IF;

    -- 3. ตรวจสอบการรีเซ็ตโควตารายเดือนสำหรับแพ็กเกจแบบชำระเงิน (basic_490, pro_990)
    -- สำหรับ free_trial จะไม่มีการรีเซ็ตรายเดือน (จำกัด 50 คิวตลอดอายุทดลองใช้)
    IF v_plan IN ('basic_490', 'pro_990') THEN
        IF (v_usage.period_end IS NOT NULL AND now() > v_usage.period_end)
           OR (v_usage.period_end IS NOT NULL AND v_sub_period_end IS NOT NULL AND v_sub_period_end > v_usage.period_end)
           OR (v_usage.period_end IS NULL AND v_sub_period_end IS NOT NULL) THEN
            UPDATE local_service.entitlement_usage
               SET bookings_used = CASE 
                       WHEN (v_usage.period_end IS NOT NULL AND now() > v_usage.period_end)
                            OR (v_usage.period_end IS NOT NULL AND v_sub_period_end IS NOT NULL AND v_sub_period_end > v_usage.period_end)
                       THEN 0 
                       ELSE bookings_used 
                   END,
                   auto_slip_used = CASE 
                       WHEN (v_usage.period_end IS NOT NULL AND now() > v_usage.period_end)
                            OR (v_usage.period_end IS NOT NULL AND v_sub_period_end IS NOT NULL AND v_sub_period_end > v_usage.period_end)
                       THEN 0 
                       ELSE auto_slip_used 
                   END,
                   period_end = v_sub_period_end,
                   updated_at = now()
             WHERE shop_id = p_shop_id
            RETURNING * INTO v_usage;
        END IF;
    END IF;

    RETURN v_usage;
END;
$$;

REVOKE ALL ON FUNCTION local_service.ensure_entitlement_row(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.ensure_entitlement_row(UUID) TO authenticated;

-- ============================================================================
-- D. TRIGGER: local_service.enforce_booking_quota (ตรวจเช็คและตัดโควตาการจอง ณ จังหวะ Confirmed)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.enforce_booking_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_usage local_service.entitlement_usage%ROWTYPE;
    v_plan TEXT := 'free_trial';
    v_limits RECORD;
BEGIN
    -- ทำงานเฉพาะเมื่อสถานะเปลี่ยนเป็น 'confirmed' เท่านั้น
    IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
        -- 1. ดึงข้อมูลการใช้งานและล็อกแถว ledger
        v_usage := local_service.ensure_entitlement_row(NEW.shop_id);

        -- 2. ตรวจสอบแผนปัจจุบัน
        SELECT COALESCE(plan, 'free_trial')
          INTO v_plan
          FROM local_service.subscriptions
         WHERE shop_id = NEW.shop_id;

        IF NOT FOUND THEN
            v_plan := 'free_trial';
        END IF;

        -- 3. ดึงขีดจำกัดตาม Tier
        SELECT bookings_limit, staff_limit, auto_slip_limit
          INTO v_limits
          FROM local_service.get_tier_limits(v_plan);

        -- 4. ตัดโควตาตามลำดับ (โควตาหลักก่อน -> แล้วค่อยตัด top-up)
        IF v_usage.bookings_used < v_limits.bookings_limit THEN
            -- หักจากโควตาหลักประจำงวด
            UPDATE local_service.entitlement_usage
               SET bookings_used = bookings_used + 1,
                   updated_at = now()
             WHERE shop_id = NEW.shop_id;
        ELSIF v_usage.bookings_topup_balance > 0 THEN
            -- โควตาหลักเต็มแล้ว หักจากเครดิต Top-up เสริม
            UPDATE local_service.entitlement_usage
               SET bookings_used = bookings_used + 1,
                   bookings_topup_balance = bookings_topup_balance - 1,
                   updated_at = now()
             WHERE shop_id = NEW.shop_id;
        ELSE
            -- โควตาทั้งหมดหมดแล้ว ไม่อนุญาตให้ยืนยันการจอง
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'BOOKING_QUOTA_EXCEEDED';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION local_service.enforce_booking_quota() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_booking_quota ON local_service.bookings;
CREATE TRIGGER trg_enforce_booking_quota
    BEFORE INSERT OR UPDATE ON local_service.bookings
    FOR EACH ROW
    EXECUTE FUNCTION local_service.enforce_booking_quota();

-- ============================================================================
-- E. RPC: local_service.create_staff (สร้างพนักงานพร้อมตรวจเช็คโควตา Staff Limit)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.create_staff(
    p_shop_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_staff_id UUID;
    v_plan TEXT;
    v_limits RECORD;
    v_active_staff_count INT;
BEGIN
    v_shop_id := p_shop_id;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Staff name is required' USING ERRCODE = '22023';
    END IF;

    -- การคืนค่าแบบ Idempotent สำหรับคำขอเดิมที่สำเร็จไปแล้ว (ต้องทำงานก่อนเช็คขีดจำกัด)
    SELECT id
      INTO v_staff_id
      FROM local_service.staff
     WHERE shop_id = v_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_staff_id IS NOT NULL THEN
        RETURN v_staff_id;
    END IF;

    -- Lock the shop's staff-limit slot transactionally so two concurrent
    -- create_staff calls near the limit cannot both pass the COUNT(*) gate.
    PERFORM pg_advisory_xact_lock(hashtext(v_shop_id::text));

    -- ตรวจสอบขีดจำกัดพนักงานตามแพ็กเกจ
    SELECT COALESCE(plan, 'free_trial')
      INTO v_plan
      FROM local_service.subscriptions
     WHERE shop_id = v_shop_id;

    IF NOT FOUND THEN
        v_plan := 'free_trial';
    END IF;

    SELECT staff_limit INTO v_limits FROM local_service.get_tier_limits(v_plan);

    SELECT COUNT(*)
      INTO v_active_staff_count
      FROM local_service.staff
     WHERE shop_id = v_shop_id
       AND is_active = true;

    IF v_active_staff_count >= v_limits.staff_limit THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'STAFF_LIMIT_EXCEEDED';
    END IF;

    INSERT INTO local_service.staff (
        shop_id, name, phone, is_active, creation_idempotency_key
    ) VALUES (
        v_shop_id, BTRIM(p_name), NULLIF(BTRIM(p_phone), ''), true, p_idempotency_key
    )
    RETURNING id INTO v_staff_id;

    RETURN v_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.create_staff(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.create_staff(UUID, TEXT, TEXT, UUID) TO authenticated;

-- ============================================================================
-- F. RPC: local_service.set_staff_active (เปิด/ปิดสถานะพนักงานพร้อมตรวจเช็ค Staff Limit)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.set_staff_active(
    p_staff_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_current_is_active BOOLEAN;
    v_plan TEXT;
    v_limits RECORD;
    v_active_staff_count INT;
BEGIN
    SELECT shop_id, is_active
      INTO v_shop_id, v_current_is_active
      FROM local_service.staff
     WHERE id = p_staff_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    -- หากเป็นการเปิดใช้งานพนักงาน (Activate) ให้ตรวจเช็คขีดจำกัดพนักงานของร้าน
    IF p_is_active = true AND (v_current_is_active IS DISTINCT FROM true) THEN
        -- Lock the shop's staff-limit slot transactionally so two concurrent
        -- set_staff_active/reactivate calls near the limit cannot both pass
        -- the COUNT(*) gate.
        PERFORM pg_advisory_xact_lock(hashtext(v_shop_id::text));

        SELECT COALESCE(plan, 'free_trial')
          INTO v_plan
          FROM local_service.subscriptions
         WHERE shop_id = v_shop_id;

        IF NOT FOUND THEN
            v_plan := 'free_trial';
        END IF;

        SELECT staff_limit INTO v_limits FROM local_service.get_tier_limits(v_plan);

        SELECT COUNT(*)
          INTO v_active_staff_count
          FROM local_service.staff
         WHERE shop_id = v_shop_id
           AND is_active = true;

        IF v_active_staff_count >= v_limits.staff_limit THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'STAFF_LIMIT_EXCEEDED';
        END IF;
    END IF;

    UPDATE local_service.staff
       SET is_active = p_is_active
     WHERE id = p_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.set_staff_active(UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.set_staff_active(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- G. RPC: local_service.apply_topup & platform_admin_add_topup (เพิ่มเครดิต Top-up เสริม)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.apply_topup(
    p_shop_id UUID,
    p_bookings_credits INTEGER DEFAULT 0,
    p_auto_slip_credits INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_usage local_service.entitlement_usage%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
    END IF;

    IF NOT (local_service.is_shop_owner(p_shop_id) OR local_service.is_platform_admin()) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or platform admin role required';
    END IF;

    IF p_bookings_credits < 0 OR p_auto_slip_credits < 0 THEN
        RAISE EXCEPTION 'Top-up credits cannot be negative' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(p_bookings_credits, 0) = 0 AND COALESCE(p_auto_slip_credits, 0) = 0 THEN
        RAISE EXCEPTION 'At least one top-up credit amount must be greater than zero' USING ERRCODE = '22023';
    END IF;

    -- ตรวจสอบให้แน่ใจว่ามีแถว entitlement และล็อกแถว
    PERFORM local_service.ensure_entitlement_row(p_shop_id);

    UPDATE local_service.entitlement_usage
       SET bookings_topup_balance = bookings_topup_balance + COALESCE(p_bookings_credits, 0),
           auto_slip_topup_balance = auto_slip_topup_balance + COALESCE(p_auto_slip_credits, 0),
           updated_at = now()
     WHERE shop_id = p_shop_id
    RETURNING * INTO v_usage;

    RETURN json_build_object(
        'success', true,
        'shop_id', p_shop_id,
        'bookings_topup_balance', v_usage.bookings_topup_balance,
        'auto_slip_topup_balance', v_usage.auto_slip_topup_balance,
        'updated_at', v_usage.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.apply_topup(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.apply_topup(UUID, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION local_service.platform_admin_add_topup(
    p_shop_id UUID,
    p_bookings_credits INTEGER DEFAULT 0,
    p_auto_slip_credits INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_platform_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Platform admin role required';
    END IF;

    RETURN local_service.apply_topup(p_shop_id, p_bookings_credits, p_auto_slip_credits);
END;
$$;

REVOKE ALL ON FUNCTION local_service.platform_admin_add_topup(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.platform_admin_add_topup(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- H. RPC: local_service.get_entitlement_usage (ดึงข้อมูลโควตาการใช้งานและยอดคงเหลือ)
-- ============================================================================

CREATE OR REPLACE FUNCTION local_service.get_entitlement_usage(
    p_shop_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_usage local_service.entitlement_usage%ROWTYPE;
    v_plan TEXT;
    v_limits RECORD;
    v_remaining_main INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
    END IF;

    IF NOT (local_service.is_shop_owner(p_shop_id) OR local_service.is_platform_admin()) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or platform admin role required';
    END IF;

    -- สร้างหรืออัปเดตสถานะรอบบิลของแถวการใช้งาน
    v_usage := local_service.ensure_entitlement_row(p_shop_id);

    SELECT COALESCE(plan, 'free_trial')
      INTO v_plan
      FROM local_service.subscriptions
     WHERE shop_id = p_shop_id;

    IF NOT FOUND THEN
        v_plan := 'free_trial';
    END IF;

    SELECT bookings_limit, staff_limit, auto_slip_limit
      INTO v_limits
      FROM local_service.get_tier_limits(v_plan);

    v_remaining_main := GREATEST(0, v_limits.bookings_limit - v_usage.bookings_used);

    RETURN json_build_object(
        'shop_id', p_shop_id,
        'plan', v_plan,
        'bookings_limit', v_limits.bookings_limit,
        'bookings_used', v_usage.bookings_used,
        'bookings_remaining_main', v_remaining_main,
        'bookings_topup_balance', v_usage.bookings_topup_balance,
        'staff_limit', v_limits.staff_limit,
        'auto_slip_limit', v_limits.auto_slip_limit,
        'auto_slip_used', v_usage.auto_slip_used,
        'auto_slip_topup_balance', v_usage.auto_slip_topup_balance,
        'period_end', v_usage.period_end,
        'updated_at', v_usage.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION local_service.get_entitlement_usage(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.get_entitlement_usage(UUID) TO authenticated;

-- ============================================================================
-- I. BACKFILL: สร้างแถวใน entitlement_usage สำหรับร้านค้าที่มีอยู่แล้วทั้งหมด
-- ============================================================================

INSERT INTO local_service.entitlement_usage (
    shop_id,
    bookings_used,
    bookings_topup_balance,
    auto_slip_used,
    auto_slip_topup_balance,
    period_end,
    updated_at
)
SELECT
    s.id AS shop_id,
    0 AS bookings_used,
    0 AS bookings_topup_balance,
    0 AS auto_slip_used,
    0 AS auto_slip_topup_balance,
    sub.current_period_end AS period_end,
    now() AS updated_at
FROM local_service.shops s
LEFT JOIN local_service.subscriptions sub ON sub.shop_id = s.id
ON CONFLICT (shop_id) DO NOTHING;
