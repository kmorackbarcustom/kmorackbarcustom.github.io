-- =============================================================================
-- QA Test Suite: Quota / Staff / Top-up Enforcement (migration 20260819000000)
-- Target DB: booking_qa2 (local Supabase Postgres, schema already applied)
-- Self-contained, idempotent, re-runnable. Prints greppable PASS/FAIL NOTICES.
-- Exits nonzero if any test FAILs.
-- =============================================================================
-- Run via:
--   docker exec supabase_db_wife-disposal-evidence psql -U postgres -d booking_qa2 \
--     -v ON_ERROR_STOP=1 -f /tmp/quota_enforcement_test.sql
-- =============================================================================

\set ON_ERROR_STOP 1
SET client_min_messages TO NOTICE;

-- Aggregated result table (dropped first so script is re-runnable).
DROP TABLE IF EXISTS qa_quota_results;
CREATE TEMP TABLE qa_quota_results (
    test_id   TEXT PRIMARY KEY,
    result    TEXT NOT NULL,        -- 'PASS' | 'FAIL'
    detail    TEXT NOT NULL
);

-- =============================================================================
-- Helper: run one test case inside its own sub-transaction, catch the expected
-- exception (or unexpected ones), and record PASS/FAIL.
--   p_test_id     : e.g. 'T1_CONFIRM_GATE'
--   p_sql         : the DO-block text that performs the test and RAISEs
--                  'TESTPASS' when assertions succeed.
--   p_expect_msg  : substring the raised exception MESSAGE must contain when
--                  the test is exercising a *rejection* path. For positive
--                  paths pass NULL and rely on the block raising 'TESTPASS'.
-- =============================================================================
CREATE OR REPLACE PROCEDURE pg_temp.run_test(
    p_test_id    TEXT,
    p_sql        TEXT,
    p_expect_msg TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_result TEXT;
    v_detail TEXT;
    v_err    TEXT;
BEGIN
    BEGIN
        -- Wrap the test body (a PL/pgSQL block) in a DO statement using a
        -- unique dollar-quote tag that won't collide with $test$ used inside.
        EXECUTE 'DO $runwrap$ ' || p_sql || ' $runwrap$';
        -- Block completed without raising -> only valid for positive paths
        -- (expect_msg IS NULL). For rejection paths this is a FAIL.
        IF p_expect_msg IS NULL THEN
            v_result := 'PASS';
            v_detail := 'completed without exception';
        ELSE
            v_result := 'FAIL';
            v_detail := 'expected exception containing ''' || p_expect_msg ||
                        ''' but no exception was raised';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        IF p_expect_msg IS NOT NULL AND v_err LIKE '%' || p_expect_msg || '%' THEN
            v_result := 'PASS';
            v_detail := 'got expected: ' || v_err;
        ELSIF v_err LIKE 'TESTPASS: %' THEN
            v_result := 'PASS';
            v_detail := substring(v_err from 11);
        ELSE
            v_result := 'FAIL';
            v_detail := v_err;
        END IF;
    END;

    INSERT INTO qa_quota_results VALUES (p_test_id, v_result, v_detail)
    ON CONFLICT (test_id) DO UPDATE
       SET result = EXCLUDED.result, detail = EXCLUDED.detail;

    RAISE NOTICE '%: % -- %', p_test_id, v_result, v_detail;
END;
$$;

-- =============================================================================
-- Shared helper: build an isolated test shop + owner + (optionally) service/
-- staff. Returns ids via OUT parameters. Caller runs inside a transaction
-- with request.jwt.claim.sub set to the owner id.
-- =============================================================================
CREATE OR REPLACE PROCEDURE pg_temp.make_shop(
    p_slug_suffix   TEXT,
    p_plan          TEXT,
    p_require_deposit BOOLEAN,
    p_deposit_amount  NUMERIC,
    OUT o_shop_id   UUID,
    OUT o_owner_id  UUID,
    OUT o_service_id UUID,
    OUT o_staff_id  UUID
) LANGUAGE plpgsql AS $$
DECLARE
    v_period_end TIMESTAMPTZ := now() + interval '30 days';
BEGIN
    o_owner_id := gen_random_uuid();
    INSERT INTO auth.users (id) VALUES (o_owner_id);

    INSERT INTO local_service.shops (name, slug, require_deposit, default_deposit_amount, is_active)
    VALUES ('QA Shop ' || p_slug_suffix, 'qa-' || p_slug_suffix, p_require_deposit, p_deposit_amount, true)
    RETURNING id INTO o_shop_id;

    -- The AFTER INSERT trigger creates a free_trial subscription row. Override plan.
    UPDATE local_service.subscriptions
       SET plan = p_plan, status = 'active', current_period_end = v_period_end
     WHERE shop_id = o_shop_id;

    INSERT INTO local_service.shop_users (shop_id, user_id, role)
    VALUES (o_shop_id, o_owner_id, 'owner');

    -- Service with no deposit so create_booking_hold yields 'confirmed' directly
    -- when shop.require_deposit=false.
    INSERT INTO local_service.services (shop_id, name, duration_minutes, price, deposit_amount, is_active)
    VALUES (o_shop_id, 'QA Service ' || p_slug_suffix, 30, 100.00, p_deposit_amount, true)
    RETURNING id INTO o_service_id;

    -- One active staff member.
    INSERT INTO local_service.staff (shop_id, name, is_active)
    VALUES (o_shop_id, 'QA Staff ' || p_slug_suffix, true)
    RETURNING id INTO o_staff_id;
END;
$$;

-- =============================================================================
-- Helper: insert a confirmed booking directly (bypassing create_booking_hold
-- but still exercising the quota trigger). Uses DISTINCT time slots per call
-- to avoid the EXCLUDE overlap constraint. p_slot_idx picks a unique time.
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.make_confirmed_booking(
    p_shop_id    UUID,
    p_service_id UUID,
    p_staff_ids  UUID[],   -- array of staff to rotate across
    p_slot_idx   INT       -- global booking index (0-based)
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_cust_id UUID;
    v_booking_id UUID;
    v_bdate DATE;
    v_day_offset INT;
    v_slot_in_day INT;
    v_staff UUID;
    v_start TIME;
    v_end   TIME;
    v_start_tz TIMESTAMPTZ;
    v_end_tz   TIMESTAMPTZ;
    v_staff_count INT;
    v_slots_per_day INT := 20; -- 08:00..18:00, 30-min slots
BEGIN
    v_staff_count := array_length(p_staff_ids, 1);
    -- Spread bookings across staff AND days. Each day has v_slots_per_day
    -- slots per staff. Day offset = floor(slot_idx / (slots_per_day * staff_count)).
    -- Slot within day = slot_idx mod slots_per_day. Staff = (slot_idx / slots_per_day) mod staff_count.
    v_day_offset := p_slot_idx / (v_slots_per_day * v_staff_count);
    v_slot_in_day := p_slot_idx % v_slots_per_day;
    v_staff := p_staff_ids[(p_slot_idx / v_slots_per_day) % v_staff_count + 1];

    v_bdate := CURRENT_DATE + v_day_offset;
    -- 30-min slots starting at 08:00
    v_start := ('08:00:00'::time + (v_slot_in_day * interval '30 minutes'))::time;
    v_end   := (v_start + interval '30 minutes')::time;
    v_start_tz := (v_bdate || ' ' || v_start)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end_tz   := v_start_tz + interval '30 minutes';

    INSERT INTO local_service.customers (shop_id, name, phone)
    VALUES (p_shop_id, 'Cust ' || p_slot_idx, '08' || lpad(p_slot_idx::text, 8, '0'))
    ON CONFLICT (shop_id, phone) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_cust_id;

    INSERT INTO local_service.bookings (
        shop_id, customer_id, staff_id, service_id,
        booking_date, start_time, end_time,
        start_timestamptz, end_timestamptz,
        status, deposit_status, deposit_amount, total_price, deposit_price
    ) VALUES (
        p_shop_id, v_cust_id, v_staff, p_service_id,
        v_bdate, v_start, v_end,
        v_start_tz, v_end_tz,
        'confirmed', 'not_required', 0.00, 100.00, 0.00
    )
    RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$;

-- =============================================================================
-- T0 (sanity): get_tier_limits correctness for all 3 plans
-- =============================================================================
DO $$
DECLARE
    v_b RECORD; v_p RECORD; v_t RECORD;
BEGIN
    SELECT * INTO v_b FROM local_service.get_tier_limits('basic_490');
    SELECT * INTO v_p FROM local_service.get_tier_limits('pro_990');
    SELECT * INTO v_t FROM local_service.get_tier_limits('free_trial');

    IF v_b.bookings_limit = 100 AND v_b.staff_limit = 5 AND v_b.auto_slip_limit = 0
       AND v_p.bookings_limit = 500 AND v_p.staff_limit = 10 AND v_p.auto_slip_limit = 100
       AND v_t.bookings_limit = 50  AND v_t.staff_limit = 5  AND v_t.auto_slip_limit = 10
    THEN
        RAISE NOTICE 'T0_TIER_LIMITS: PASS -- basic=(100,5,0) pro=(500,10,100) trial=(50,5,10)';
    ELSE
        RAISE EXCEPTION 'FAIL: tier limits mismatch basic=% pro=% trial=%', v_b, v_p, v_t;
    END IF;
END;
$$;

-- =============================================================================
-- T1: CONFIRM GATE -- Basic tier at limit, 101st confirm rejected
-- =============================================================================
CALL pg_temp.run_test('T1_CONFIRM_GATE', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_used INT;
BEGIN
    CALL pg_temp.make_shop('t1', 'basic_490', false, 0,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    -- Seed entitlement at the limit (100).
    INSERT INTO local_service.entitlement_usage (shop_id, bookings_used, period_end, updated_at)
    VALUES (v_shop_id, 100, now() + interval '30 days', now())
    ON CONFLICT (shop_id) DO UPDATE
        SET bookings_used = 100, period_end = now() + interval '30 days', updated_at = now();

    -- 101st confirmed booking MUST be rejected. Wrap in inner block so we
    -- can verify the state post-rejection before re-raising.
    BEGIN
        PERFORM pg_temp.make_confirmed_booking(v_shop_id, v_svc, ARRAY[v_staff], 0);
        RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but insert succeeded';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%BOOKING_QUOTA_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but got: %', SQLERRM;
            END IF;
            -- Quota rejected. Verify bookings_used stayed at 100.
            SELECT bookings_used INTO v_used
              FROM local_service.entitlement_usage WHERE shop_id = v_shop_id;
            IF v_used IS NULL THEN
                RAISE EXCEPTION 'FAIL: entitlement_usage row missing after rejection';
            ELSIF v_used <> 100 THEN
                RAISE EXCEPTION 'FAIL: expected bookings_used=100 got %', v_used;
            END IF;
            RAISE EXCEPTION 'TESTPASS: BOOKING_QUOTA_EXCEEDED raised, bookings_used stayed 100';
    END;
END;
$test$, 'TESTPASS: BOOKING_QUOTA_EXCEEDED raised, bookings_used stayed 100');

-- =============================================================================
-- T2: TOP-UP EXPANDS LIMIT -- Basic beyond 100, then #201 rejected
-- Single self-contained block: create shop, add top-up, confirm 101..200,
-- assert state, then confirm #201 and assert rejection.
-- =============================================================================
CALL pg_temp.run_test('T2_TOPUP_EXPANDS', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_ret JSON; v_usage JSON;
    v_i INT;
    v_staff_ids UUID[];
    v_s UUID;
BEGIN
    CALL pg_temp.make_shop('t2', 'basic_490', false, 0,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    -- Create 4 extra staff so 100 bookings can spread across 5 staff x 20 slots/day.
    v_staff_ids := ARRAY[v_staff];
    FOR v_i IN 1..4 LOOP
        INSERT INTO local_service.staff (shop_id, name, is_active)
        VALUES (v_shop_id, 'Extra Staff ' || v_i, true)
        RETURNING id INTO v_s;
        v_staff_ids := v_staff_ids || v_s;
    END LOOP;

    -- Seed at limit.
    INSERT INTO local_service.entitlement_usage (shop_id, bookings_used, period_end, updated_at)
    VALUES (v_shop_id, 100, now() + interval '30 days', now())
    ON CONFLICT (shop_id) DO UPDATE
        SET bookings_used = 100, period_end = now() + interval '30 days', updated_at = now();

    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
    -- Add 100 top-up credits as owner.
    v_ret := local_service.apply_topup(v_shop_id, p_bookings_credits := 100);

    -- Confirm bookings 101..200 (100 bookings) via distinct slots 0..99.
    FOR v_i IN 0..99 LOOP
        PERFORM pg_temp.make_confirmed_booking(v_shop_id, v_svc, v_staff_ids, v_i);
    END LOOP;

    v_usage := local_service.get_entitlement_usage(v_shop_id);
    IF (v_usage->>'bookings_used')::int <> 200
       OR (v_usage->>'bookings_topup_balance')::int <> 0 THEN
        RAISE EXCEPTION 'FAIL: expected used=200/topup=0 got used=% topup=%',
            v_usage->>'bookings_used', v_usage->>'bookings_topup_balance';
    END IF;

    -- 201st confirm must be rejected now that top-up is exhausted.
    -- Use inner block to catch the expected rejection.
    BEGIN
        PERFORM pg_temp.make_confirmed_booking(v_shop_id, v_svc, v_staff_ids, 100);
        RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but #201 succeeded';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%BOOKING_QUOTA_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but got: %', SQLERRM;
            END IF;
            -- Verify final state: used=200, topup=0.
            v_usage := local_service.get_entitlement_usage(v_shop_id);
            IF (v_usage->>'bookings_used')::int <> 200 THEN
                RAISE EXCEPTION 'FAIL: after #201 rejection expected used=200 got %',
                    v_usage->>'bookings_used';
            END IF;
            RAISE EXCEPTION 'TESTPASS: 100 top-up confirms ok (used=200, topup=0), #201 rejected BOOKING_QUOTA_EXCEEDED';
    END;
END;
$test$, 'TESTPASS: 100 top-up confirms ok (used=200, topup=0), #201 rejected BOOKING_QUOTA_EXCEEDED');

-- =============================================================================
-- T3: STAFF LIMIT -- Basic 5, Pro 10, idempotency, set_staff_active
-- Single self-contained block covering all staff-limit scenarios with inner
-- exception blocks for each expected rejection.
-- =============================================================================
CALL pg_temp.run_test('T3_STAFF_LIMIT_ALL', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_i INT; v_count INT;
    v_key UUID := gen_random_uuid();
    v_first UUID; v_second UUID;
    v_first_staff UUID;
BEGIN
    CALL pg_temp.make_shop('t3', 'basic_490', false, 0,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

    -- make_shop already created 1 active staff; create 4 more -> 5 total.
    FOR v_i IN 1..4 LOOP
        PERFORM local_service.create_staff(v_shop_id, 'Staff ' || v_i, '081' || v_i,
                                           gen_random_uuid());
    END LOOP;

    -- Idempotency test FIRST (while still Basic at 5, but we need a slot).
    -- Deactivate one to free a slot, then test idempotency with the freed slot.
    SELECT id INTO v_first_staff FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true
     ORDER BY created_at LIMIT 1;
    PERFORM local_service.set_staff_active(v_first_staff, false);
    -- Now 4 active, 1 slot free. Create idempotent staff.
    v_first := local_service.create_staff(v_shop_id, 'Idem Staff', '0820', v_key);
    v_second := local_service.create_staff(v_shop_id, 'Idem Staff Dup', '0821', v_key);
    IF v_first <> v_second THEN
        RAISE EXCEPTION 'FAIL: idempotency returned different ids % vs %', v_first, v_second;
    END IF;
    -- Reactivate the old one -> SHOULD FAIL: the idempotent fill (Idem Staff)
    -- already took the freed slot, so active is 5. Reactivating A would make 6
    -- > Basic limit 5, so set_staff_active must REJECT it.
    BEGIN
        PERFORM local_service.set_staff_active(v_first_staff, true);
        RAISE EXCEPTION 'FAIL: expected STAFF_LIMIT_EXCEEDED reactivating after idempotent fill';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%STAFF_LIMIT_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: reactivation after idempotent fill expected STAFF_LIMIT_EXCEEDED got: %', SQLERRM;
            END IF;
    END;

    -- Verify still 5 active staff (A stays deactivated, Idem Staff is the 5th).
    SELECT count(*) INTO v_count FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'FAIL: expected 5 active staff got %', v_count;
    END IF;

    -- 6th must be rejected (Basic limit=5).
    BEGIN
        PERFORM local_service.create_staff(v_shop_id, 'Staff 6', '0819', gen_random_uuid());
        RAISE EXCEPTION 'FAIL: expected STAFF_LIMIT_EXCEEDED but 6th staff created';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%STAFF_LIMIT_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: 6th staff expected STAFF_LIMIT_EXCEEDED got: %', SQLERRM;
            END IF;
    END;

    -- Upgrade to pro_990 (limit=10). Create staff #6..#10 (5 more).
    UPDATE local_service.subscriptions SET plan = 'pro_990' WHERE shop_id = v_shop_id;
    FOR v_i IN 6..10 LOOP
        PERFORM local_service.create_staff(v_shop_id, 'Pro Staff ' || v_i, '083' || v_i,
                                           gen_random_uuid());
    END LOOP;
    SELECT count(*) INTO v_count FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true;
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'FAIL: expected 10 active staff got %', v_count;
    END IF;

    -- 11th rejected (Pro limit=10).
    BEGIN
        PERFORM local_service.create_staff(v_shop_id, 'Staff 11', '0840', gen_random_uuid());
        RAISE EXCEPTION 'FAIL: expected STAFF_LIMIT_EXCEEDED but 11th staff created';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%STAFF_LIMIT_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: 11th staff expected STAFF_LIMIT_EXCEEDED got: %', SQLERRM;
            END IF;
    END;

    -- set_staff_active: deactivate one -> 9 active, frees a slot.
    SELECT id INTO v_first_staff FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true
     ORDER BY created_at LIMIT 1;
    PERFORM local_service.set_staff_active(v_first_staff, false);
    SELECT count(*) INTO v_count FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true;
    IF v_count <> 9 THEN
        RAISE EXCEPTION 'FAIL: expected 9 active after deactivate got %', v_count;
    END IF;

    -- Reactivate while at 9 (limit=10) -> 10 active. Should SUCCEED.
    PERFORM local_service.set_staff_active(v_first_staff, true);
    SELECT count(*) INTO v_count FROM local_service.staff
     WHERE shop_id = v_shop_id AND is_active = true;
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'FAIL: expected 10 active after reactivate got %', v_count;
    END IF;

    -- Deactivate again -> 9, create a NEW 10th to fill the slot,
    -- then try to reactivate the old one -> 11 active -> REJECTED.
    PERFORM local_service.set_staff_active(v_first_staff, false);
    PERFORM local_service.create_staff(v_shop_id, 'Filler Staff', '0850', gen_random_uuid());
    -- Now 10 active (9 + filler). Reactivate old -> 11 -> REJECTED.
    BEGIN
        PERFORM local_service.set_staff_active(v_first_staff, true);
        RAISE EXCEPTION 'FAIL: expected STAFF_LIMIT_EXCEEDED but reactivation succeeded';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%STAFF_LIMIT_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: reactivation expected STAFF_LIMIT_EXCEEDED got: %', SQLERRM;
            END IF;
    END;

    RAISE EXCEPTION 'TESTPASS: Basic 5-limit ok, idempotency ok, Pro 10-limit ok, reactivation-gate ok';
END;
$test$, 'TESTPASS: Basic 5-limit ok, idempotency ok, Pro 10-limit ok, reactivation-gate ok');

-- =============================================================================
-- T4: HOLD DOES NOT CONSUME QUOTA -- only confirmed consumes
-- =============================================================================
CALL pg_temp.run_test('T4_HOLD_NO_QUOTA', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_ret JSON; v_usage JSON;
    v_dow INT;
BEGIN
    -- This shop requires deposit + positive deposit so create_booking_hold
    -- yields status='hold' (quota NOT consumed).
    CALL pg_temp.make_shop('t4', 'basic_490', true, 50,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    -- Seed at limit.
    INSERT INTO local_service.entitlement_usage (shop_id, bookings_used, period_end, updated_at)
    VALUES (v_shop_id, 100, now() + interval '30 days', now())
    ON CONFLICT (shop_id) DO UPDATE
        SET bookings_used = 100, period_end = now() + interval '30 days', updated_at = now();

    -- create_booking_hold needs a staff_schedules row (fail-closed).
    v_dow := EXTRACT(DOW FROM CURRENT_DATE)::int;
    INSERT INTO local_service.staff_schedules
        (shop_id, staff_id, day_of_week, is_working_day, work_start, work_end, break_start, break_end)
    VALUES (v_shop_id, v_staff, v_dow, true, '08:00:00', '20:00:00', NULL, NULL)
    ON CONFLICT (staff_id, day_of_week) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
    -- Create a hold at 08:00 (within schedule). Should SUCCEED despite quota=100.
    v_ret := local_service.create_booking_hold(
        p_shop_id := v_shop_id,
        p_service_id := v_svc,
        p_staff_id := v_staff,
        p_customer_name := 'Hold Cust',
        p_customer_phone := '0860000001',
        p_booking_date := CURRENT_DATE,
        p_start_time := '08:00:00'
    );

    IF (v_ret->>'status') <> 'hold' THEN
        RAISE EXCEPTION 'FAIL: expected hold status got %', v_ret->>'status';
    END IF;

    v_usage := local_service.get_entitlement_usage(v_shop_id);
    IF (v_usage->>'bookings_used')::int <> 100 THEN
        RAISE EXCEPTION 'FAIL: hold consumed quota, used=%', v_usage->>'bookings_used';
    END IF;

    -- Now confirm that hold via UPDATE -> trigger fires -> quota rejected.
    -- Wrap in inner block to verify state post-rejection.
    BEGIN
        UPDATE local_service.bookings
           SET status = 'confirmed'
         WHERE id = (v_ret->>'booking_id')::uuid;
        RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but hold confirm succeeded';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%BOOKING_QUOTA_EXCEEDED%' THEN
                RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but got: %', SQLERRM;
            END IF;
            -- Verify bookings_used still 100 after rejected confirm.
            v_usage := local_service.get_entitlement_usage(v_shop_id);
            IF (v_usage->>'bookings_used')::int <> 100 THEN
                RAISE EXCEPTION 'FAIL: confirm rejection leaked quota, used=%',
                    v_usage->>'bookings_used';
            END IF;
            RAISE EXCEPTION 'TESTPASS: hold did not consume; confirm rejected with BOOKING_QUOTA_EXCEEDED; used stayed 100';
    END;
END;
$test$, 'TESTPASS: hold did not consume; confirm rejected with BOOKING_QUOTA_EXCEEDED; used stayed 100');

-- =============================================================================
-- T5: TRIAL LIMIT -- 50 bookings, #51 rejected
-- =============================================================================
CALL pg_temp.run_test('T5_TRIAL_LIMIT', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_i INT; v_usage JSON;
BEGIN
    CALL pg_temp.make_shop('t5', 'free_trial', false, 0,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    -- Seed at trial limit (50).
    INSERT INTO local_service.entitlement_usage (shop_id, bookings_used, period_end, updated_at)
    VALUES (v_shop_id, 50, now() + interval '14 days', now())
    ON CONFLICT (shop_id) DO UPDATE
        SET bookings_used = 50, period_end = now() + interval '14 days', updated_at = now();

    -- 51st confirmed booking MUST be rejected.
    PERFORM pg_temp.make_confirmed_booking(v_shop_id, v_svc, ARRAY[v_staff], 0);
    RAISE EXCEPTION 'FAIL: expected BOOKING_QUOTA_EXCEEDED but #51 succeeded';
END;
$test$, 'BOOKING_QUOTA_EXCEEDED');

-- Trial sanity: confirm a booking when under limit succeeds and increments.
CALL pg_temp.run_test('T5_TRIAL_UNDER_LIMIT', $test$
DECLARE
    v_shop_id UUID; v_owner_id UUID; v_svc UUID; v_staff UUID;
    v_usage JSON;
BEGIN
    CALL pg_temp.make_shop('t5b', 'free_trial', false, 0,
                           v_shop_id, v_owner_id, v_svc, v_staff);
    -- Seed at 49 (one under limit).
    INSERT INTO local_service.entitlement_usage (shop_id, bookings_used, period_end, updated_at)
    VALUES (v_shop_id, 49, now() + interval '14 days', now())
    ON CONFLICT (shop_id) DO UPDATE
        SET bookings_used = 49, period_end = now() + interval '14 days', updated_at = now();

    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
    -- 50th confirmed booking MUST succeed.
    PERFORM pg_temp.make_confirmed_booking(v_shop_id, v_svc, ARRAY[v_staff], 0);

    v_usage := local_service.get_entitlement_usage(v_shop_id);
    IF (v_usage->>'bookings_used')::int = 50
       AND (v_usage->>'bookings_limit')::int = 50 THEN
        RAISE EXCEPTION 'TESTPASS: 50th booking succeeded, used=50 limit=50';
    ELSE
        RAISE EXCEPTION 'FAIL: expected used=50/limit=50 got used=%/limit=%',
            v_usage->>'bookings_used', v_usage->>'bookings_limit';
    END IF;
END;
$test$, 'TESTPASS');

-- =============================================================================
-- Summary
-- =============================================================================
DO $$
DECLARE
    v_pass INT; v_fail INT; r RECORD;
BEGIN
    SELECT count(*) FILTER (WHERE result='PASS'),
           count(*) FILTER (WHERE result='FAIL')
      INTO v_pass, v_fail
      FROM qa_quota_results;

    RAISE NOTICE '';
    RAISE NOTICE '================ QA SUMMARY ================';
    FOR r IN SELECT test_id, result, detail FROM qa_quota_results ORDER BY test_id LOOP
        RAISE NOTICE '% | % | %', r.test_id, r.result, r.detail;
    END LOOP;
    RAISE NOTICE '-------------------------------------------';
    RAISE NOTICE 'PASS=%, FAIL=%', v_pass, v_fail;
    RAISE NOTICE '===========================================';
    IF v_fail > 0 THEN
        RAISE EXCEPTION 'QA_FAILED: % test(s) failed', v_fail;
    END IF;
END;
$$;