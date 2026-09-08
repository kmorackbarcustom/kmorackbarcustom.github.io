-- ทดสอบ staff gate ตรงๆ เลียนแบบ helper Qwen (ใช้ trigger สร้าง subscription)
\set ON_ERROR_STOP off
\set client_min_messages NOTICE

DO $$
DECLARE
    v_shop_id UUID; v_owner_id UUID;
    v_i INT; v_count INT; v_staff UUID;
BEGIN
    v_owner_id := gen_random_uuid();
    INSERT INTO auth.users (id) VALUES (v_owner_id);

    INSERT INTO local_service.shops (name, slug, require_deposit, default_deposit_amount, is_active)
    VALUES ('staffgate-test', 'staffgate-'||gen_random_uuid(), false, 0, true)
    RETURNING id INTO v_shop_id;

    -- trigger สร้าง free_trial subscription ให้ -> override เป็น basic
    UPDATE local_service.subscriptions
       SET plan='basic_490', status='active', current_period_end=now()+interval '30 days'
     WHERE shop_id=v_shop_id;

    INSERT INTO local_service.shop_users (shop_id, user_id, role)
    VALUES (v_shop_id, v_owner_id, 'owner');

    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);

    -- สร้าง staff 5 คนแรก (Basic limit 5) - shop ยังไม่มี staff (ต่างจาก helper Qwen ที่ make_shop สร้าง 1)
    FOR v_i IN 1..5 LOOP
        PERFORM local_service.create_staff(v_shop_id, 'S'||v_i, '08'||v_i, gen_random_uuid());
    END LOOP;

    SELECT count(*) INTO v_count FROM local_service.staff WHERE shop_id=v_shop_id AND is_active=true;
    RAISE NOTICE '[Basic-5-active] count=% (expect 5)', v_count;
    IF v_count <> 5 THEN RAISE EXCEPTION 'FAIL: expected 5 got %', v_count; END IF;

    -- คนที่ 6 reject
    BEGIN
        PERFORM local_service.create_staff(v_shop_id, 'S6', '086', gen_random_uuid());
        RAISE EXCEPTION 'FAIL: 6th NOT rejected (Basic 5)';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%STAFF_LIMIT_EXCEEDED%' THEN RAISE NOTICE '[Basic-6th] PASS rejected';
        ELSE RAISE EXCEPTION 'FAIL: 6th got: %', SQLERRM; END IF;
    END;

    -- upgrade Pro -> 10
    UPDATE local_service.subscriptions SET plan='pro_990' WHERE shop_id=v_shop_id;
    FOR v_i IN 6..10 LOOP
        PERFORM local_service.create_staff(v_shop_id, 'P'||v_i, '08'||v_i, gen_random_uuid());
    END LOOP;

    SELECT count(*) INTO v_count FROM local_service.staff WHERE shop_id=v_shop_id AND is_active=true;
    RAISE NOTICE '[Pro-10-active] count=% (expect 10)', v_count;
    IF v_count <> 10 THEN RAISE EXCEPTION 'FAIL: expected 10 got %', v_count; END IF;

    -- คนที่ 11 reject
    BEGIN
        PERFORM local_service.create_staff(v_shop_id, 'S11', '0811', gen_random_uuid());
        RAISE EXCEPTION 'FAIL: 11th NOT rejected (Pro 10)';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%STAFF_LIMIT_EXCEEDED%' THEN RAISE NOTICE '[Pro-11th] PASS rejected';
        ELSE RAISE EXCEPTION 'FAIL: 11th got: %', SQLERRM; END IF;
    END;

    -- set_staff_active reactivation gate
    PERFORM local_service.set_staff_active(
        (SELECT id FROM local_service.staff WHERE shop_id=v_shop_id AND is_active=true ORDER BY created_at LIMIT 1), false);
    SELECT count(*) INTO v_count FROM local_service.staff WHERE shop_id=v_shop_id AND is_active=true;
    RAISE NOTICE '[deactivate] count=% (expect 9)', v_count;

    RAISE NOTICE 'STAFF_GATE_MANUAL: ALL PASS';
END $$;
