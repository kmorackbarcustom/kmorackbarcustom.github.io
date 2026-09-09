BEGIN;
CREATE TEMP TABLE kmo_duration_proof_results(test_name TEXT, passed BOOLEAN);

DO $proof$
DECLARE
  v_shop UUID;
  v_owner UUID;
  v_hour UUID;
  v_day UUID;
  v_staff UUID;
  v_date DATE;
  v_dow INTEGER;
  v_start TIME;
  v_minutes INTEGER;
  v_value NUMERIC;
  v_unit TEXT;
BEGIN
  SELECT id INTO v_shop FROM local_service.shops
  WHERE slug='kmo-rackbarcustom' LIMIT 1;
  SELECT user_id INTO v_owner FROM local_service.shop_users
  WHERE shop_id=v_shop AND role='owner' LIMIT 1;
  IF v_shop IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'PROOF_FIXTURE_MISSING';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_hour := local_service.create_service_v2(
    v_shop,'PROOF 1.5 HOUR','transactional proof',1.5,'hour',100,0,
    gen_random_uuid()
  );
  SELECT duration_minutes,duration_value,duration_unit
  INTO v_minutes,v_value,v_unit
  FROM local_service.services WHERE id=v_hour;
  IF v_minutes<>90 OR v_value<>1.5 OR v_unit<>'hour' THEN
    RAISE EXCEPTION 'HOUR_NORMALIZATION_FAIL';
  END IF;
  INSERT INTO kmo_duration_proof_results VALUES('hour_normalization', true);

  PERFORM local_service.update_service(
    v_hour,'PROOF LEGACY UPDATE','legacy compatibility',75,100,0
  );
  SELECT duration_minutes,duration_value,duration_unit
  INTO v_minutes,v_value,v_unit
  FROM local_service.services WHERE id=v_hour;
  IF v_minutes<>75 OR v_value<>75 OR v_unit<>'minute' THEN
    RAISE EXCEPTION 'LEGACY_DURATION_UPDATE_FAIL';
  END IF;
  INSERT INTO kmo_duration_proof_results VALUES('legacy_update_compatible', true);

  BEGIN
    PERFORM local_service.create_service_v2(
      v_shop,'PROOF BAD HOUR','must reject',1.333,'hour',100,0,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'FRACTIONAL_MINUTE_WAS_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FRACTIONAL_MINUTE_WAS_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%whole minutes%' THEN RAISE; END IF;
    INSERT INTO kmo_duration_proof_results VALUES('fractional_minute_denied', true);
  END;

  v_day := local_service.create_service_v2(
    v_shop,'PROOF 2 DAY','transactional proof',2,'day',100,0,
    gen_random_uuid()
  );
  SELECT duration_minutes,duration_value,duration_unit
  INTO v_minutes,v_value,v_unit
  FROM local_service.services WHERE id=v_day;
  IF v_minutes<>2880 OR v_value<>2 OR v_unit<>'day' THEN
    RAISE EXCEPTION 'DAY_PERSISTENCE_FAIL';
  END IF;
  INSERT INTO kmo_duration_proof_results VALUES('day_persistence', true);
  SELECT gs::DATE, EXTRACT(DOW FROM gs)::INTEGER, ws.open_time
  INTO v_date,v_dow,v_start
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + 14, INTERVAL '1 day') gs
  JOIN local_service.shop_weekly_schedules ws
    ON ws.shop_id=v_shop AND ws.day_of_week=EXTRACT(DOW FROM gs)::INTEGER
  WHERE ws.is_open=true
    AND NOT EXISTS (
      SELECT 1 FROM local_service.shop_holidays h
      WHERE h.shop_id=v_shop AND h.staff_id IS NULL AND h.holiday_date=gs::DATE
    )
  ORDER BY gs LIMIT 1;
  IF v_date IS NULL THEN RAISE EXCEPTION 'NO_OPEN_PROOF_DATE'; END IF;

  INSERT INTO local_service.staff(shop_id,name,nickname,phone,is_active)
  VALUES(v_shop,'PROOF STAFF','PROOF','0000000000',true)
  RETURNING id INTO v_staff;

  INSERT INTO local_service.staff_schedules(
    shop_id,staff_id,day_of_week,is_working_day,work_start,work_end,break_start,break_end
  )
  SELECT v_shop,v_staff,v_dow,true,open_time,close_time,NULL,NULL
  FROM local_service.shop_weekly_schedules
  WHERE shop_id=v_shop AND day_of_week=v_dow;

  BEGIN
    PERFORM local_service.create_booking_hold(
      v_shop,v_day,v_staff,'Proof Customer','0800000000',NULL,
      v_date,v_start,'duration-unit proof'
    );
    RAISE EXCEPTION 'DAY_BOOKING_WAS_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='DAY_BOOKING_WAS_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%DAY_SPAN_BOOKING_NOT_ENABLED%' THEN RAISE; END IF;
    INSERT INTO kmo_duration_proof_results VALUES('day_booking_fail_closed', true);
  END;
END;
$proof$;

SELECT test_name,passed FROM kmo_duration_proof_results ORDER BY test_name;
ROLLBACK;
