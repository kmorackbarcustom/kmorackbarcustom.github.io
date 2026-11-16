ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_job_id_fkey;

CREATE OR REPLACE FUNCTION public.generate_job_id(p_platform text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prefix TEXT;
  v_year_month TEXT;
  v_max_seq INTEGER;
  v_new_seq TEXT;
BEGIN
  CASE LOWER(TRIM(p_platform))
    WHEN 'facebook' THEN v_prefix := 'KFB';
    WHEN 'line' THEN v_prefix := 'KLI';
    WHEN 'tiktok' THEN v_prefix := 'KTK';
    WHEN 'instagram' THEN v_prefix := 'KIG';
    WHEN 'หน้าร้าน' THEN v_prefix := 'KWN';
    WHEN 'เพื่อนแนะนำ' THEN v_prefix := 'KRF';
    ELSE v_prefix := 'KOT';
  END CASE;

  v_year_month := TO_CHAR(NOW(), 'YYMM');

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(job_id, '-', 3) AS INTEGER)
  ), 0) INTO v_max_seq
  FROM bookings
  WHERE job_id LIKE v_prefix || '-' || v_year_month || '-%';

  v_new_seq := LPAD((v_max_seq + 1)::TEXT, 4, '0');

  RETURN v_prefix || '-' || v_year_month || '-' || v_new_seq;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_booking(p_payload jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing public.bookings%ROWTYPE;
  v_appointment date;
  v_pickup date;
  v_total numeric;
  v_job_id text;
  v_booking_id integer;
  v_workdays integer;
BEGIN
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'KMO_BAD_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  SELECT b.* INTO v_existing
  FROM public.booking_requests r JOIN public.bookings b ON b.job_id = r.job_id
  WHERE r.request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('job_id', v_existing.job_id, 'booking_id', v_existing.id, 'replay', true);
  END IF;

  IF nullif(trim(p_payload->>'customer_name'), '') IS NULL
     OR nullif(trim(p_payload->>'phone'), '') IS NULL
     OR nullif(trim(p_payload->>'brand'), '') IS NULL
     OR nullif(trim(p_payload->>'product'), '') IS NULL
     OR nullif(trim(p_payload->>'source'), '') IS NULL
     OR nullif(trim(p_payload->>'appointment_date'), '') IS NULL THEN
    RAISE EXCEPTION 'KMO_BAD_REQUEST' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(p_payload->>'pickup_date'), '') IS NULL THEN
    RAISE EXCEPTION 'KMO_PICKUP_MISSING' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_appointment := (p_payload->>'appointment_date')::date;
    v_pickup := (p_payload->>'pickup_date')::date;
    IF nullif(p_payload->>'estimated_total', '') IS NOT NULL THEN
      v_total := (p_payload->>'estimated_total')::numeric;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'KMO_BAD_REQUEST' USING ERRCODE = 'P0001';
  END;
  IF NOT isfinite(v_appointment) OR NOT isfinite(v_pickup)
     OR (v_total IS NOT NULL AND (v_total IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) OR v_total < 0)) THEN
    RAISE EXCEPTION 'KMO_BAD_REQUEST' USING ERRCODE = 'P0001';
  END IF;

  IF v_appointment < public.kmo_today() THEN
    RAISE EXCEPTION 'KMO_APPOINT_PAST' USING ERRCODE = 'P0001';
  END IF;
  IF extract(dow FROM v_appointment)::integer = ANY(public.kmo_closed_weekdays()) THEN
    RAISE EXCEPTION 'KMO_APPOINT_CLOSED_WEEKDAY' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.holidays WHERE date = v_appointment) THEN
    RAISE EXCEPTION 'KMO_APPOINT_HOLIDAY' USING ERRCODE = 'P0001';
  END IF;
  IF v_pickup < v_appointment THEN
    RAISE EXCEPTION 'KMO_PICKUP_BEFORE_APPOINT' USING ERRCODE = 'P0001';
  END IF;

  IF v_pickup - v_appointment >= 2 THEN
    v_workdays := public.kmo_min_booking_workdays();
  ELSE
    SELECT count(*)::integer INTO v_workdays
    FROM generate_series(v_appointment, v_pickup, interval '1 day') AS d(day)
    WHERE extract(dow FROM d.day)::integer <> ALL(public.kmo_closed_weekdays());
  END IF;
  IF v_workdays < public.kmo_min_booking_workdays() THEN
    RAISE EXCEPTION 'KMO_MIN_WORKDAYS' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kmo:booking:' || to_char(v_appointment, 'YYYY-MM-DD')));
  SELECT b.* INTO v_existing
  FROM public.booking_requests r JOIN public.bookings b ON b.job_id = r.job_id
  WHERE r.request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('job_id', v_existing.job_id, 'booking_id', v_existing.id, 'replay', true);
  END IF;
  IF (SELECT count(*) FROM public.bookings b
      WHERE b.appointment_date = v_appointment
        AND public.booking_uses_slot(b.queue_status, b.production_status)) >= public.kmo_booking_daily_cap() THEN
    RAISE EXCEPTION 'KMO_DAY_FULL' USING ERRCODE = 'P0001';
  END IF;

  v_job_id := public.kmo_next_job_id(p_payload->>'source');
  INSERT INTO public.bookings(job_id, source, customer_name, phone, line_uid, brand, model, product, color,
      appointment_date, pickup_date, queue_status, production_status, cart_meta, estimated_total, source_page)
  VALUES (v_job_id, p_payload->>'source', trim(p_payload->>'customer_name'), trim(p_payload->>'phone'),
      p_payload->>'line_uid', trim(p_payload->>'brand'), p_payload->>'model', trim(p_payload->>'product'),
      p_payload->>'color', v_appointment, v_pickup, 'ยืนยัน', 'รอเริ่มงาน', p_payload->'cart_meta', v_total,
      p_payload->>'source_page')
  RETURNING id INTO v_booking_id;
  INSERT INTO public.booking_requests(request_id, job_id) VALUES (p_request_id, v_job_id);
  RETURN jsonb_build_object('job_id', v_job_id, 'booking_id', v_booking_id, 'replay', false);
EXCEPTION WHEN unique_violation THEN
  SELECT b.* INTO v_existing
  FROM public.booking_requests r JOIN public.bookings b ON b.job_id = r.job_id
  WHERE r.request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('job_id', v_existing.job_id, 'booking_id', v_existing.id, 'replay', true);
  END IF;
  RAISE;
END
$function$;
