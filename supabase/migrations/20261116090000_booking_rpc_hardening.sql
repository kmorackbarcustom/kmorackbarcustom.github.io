CREATE OR REPLACE FUNCTION public.kmo_closed_weekdays()
RETURNS integer[] LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$ SELECT ARRAY[2]::integer[] $function$;

CREATE OR REPLACE FUNCTION public.kmo_booking_daily_cap()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$ SELECT 3 $function$;

CREATE OR REPLACE FUNCTION public.kmo_min_booking_workdays()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$ SELECT 2 $function$;

CREATE OR REPLACE FUNCTION public.booking_uses_slot(queue_status text, production_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT coalesce(queue_status <> 'ยกเลิก', true)
     AND coalesce(production_status <> 'ยกเลิก', true)
$function$;

CREATE TABLE IF NOT EXISTS public.booking_requests (
  request_id uuid PRIMARY KEY,
  job_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.booking_job_counters (
  prefix text NOT NULL,
  ym text NOT NULL,
  last_seq integer NOT NULL,
  PRIMARY KEY (prefix, ym)
);
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_job_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_requests, public.booking_job_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kmo_next_job_id(p_platform text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prefix text;
  v_ym text := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM');
  v_seq integer;
BEGIN
  CASE lower(trim(coalesce(p_platform, '')))
    WHEN 'facebook' THEN v_prefix := 'KFB';
    WHEN 'line' THEN v_prefix := 'KLI';
    WHEN 'tiktok' THEN v_prefix := 'KTK';
    WHEN 'instagram' THEN v_prefix := 'KIG';
    WHEN 'หน้าร้าน' THEN v_prefix := 'KWN';
    WHEN 'เพื่อนแนะนำ' THEN v_prefix := 'KRF';
    ELSE v_prefix := 'KOT';
  END CASE;

  INSERT INTO public.booking_job_counters(prefix, ym, last_seq)
  SELECT v_prefix, v_ym, current_max.last_seq + 1
  FROM (SELECT coalesce(max((regexp_match(job_id, '^[A-Z]{3}-[0-9]{4}-([0-9]+)$'))[1]::integer), 0) AS last_seq
        FROM public.bookings WHERE job_id LIKE v_prefix || '-' || v_ym || '-%') AS current_max
  ON CONFLICT (prefix, ym) DO UPDATE
    SET last_seq = greatest(public.booking_job_counters.last_seq, EXCLUDED.last_seq - 1) + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '-' || v_ym || '-' || lpad(v_seq::text, 4, '0');
END
$function$;

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

  PERFORM pg_advisory_xact_lock(hashtext('kmo:booking:' || v_appointment::text));
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

CREATE OR REPLACE FUNCTION public.attach_booking_images(p_request_id uuid, p_images text[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job_id text;
BEGIN
  IF p_request_id IS NULL OR p_images IS NULL THEN
    RAISE EXCEPTION 'KMO_BAD_REQUEST' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(p_images) > 10 THEN
    RAISE EXCEPTION 'KMO_TOO_MANY_IMAGES' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_images) u(url)
             WHERE u.url IS NULL OR length(u.url) > 500 OR u.url NOT LIKE 'https://xfhpwxjywqgqefbncumm.supabase.co/storage/v1/object/public/booking-images/%') THEN
    RAISE EXCEPTION 'KMO_IMAGE_URL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT job_id INTO v_job_id FROM public.booking_requests WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KMO_REQUEST_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.bookings SET images = p_images WHERE job_id = v_job_id AND coalesce(cardinality(images), 0) = 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KMO_IMAGES_ALREADY_ATTACHED' USING ERRCODE = 'P0001';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_day_usage(p_start date, p_end date)
RETURNS TABLE(day date, used integer, cap integer, is_closed boolean, closed_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end - p_start >= 366 THEN
    RAISE EXCEPTION 'KMO_BAD_RANGE' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT d.day::date,
      (SELECT count(*)::integer FROM public.bookings b
       WHERE b.appointment_date = d.day::date AND public.booking_uses_slot(b.queue_status, b.production_status)),
      public.kmo_booking_daily_cap(),
      extract(dow FROM d.day)::integer = ANY(public.kmo_closed_weekdays()) OR EXISTS
        (SELECT 1 FROM public.holidays h WHERE h.date = d.day::date),
      CASE WHEN extract(dow FROM d.day)::integer = ANY(public.kmo_closed_weekdays()) THEN 'weekday'
           WHEN EXISTS (SELECT 1 FROM public.holidays h WHERE h.date = d.day::date) THEN 'holiday'
           ELSE NULL END
    FROM generate_series(p_start, p_end, interval '1 day') d(day);
END
$function$;

CREATE OR REPLACE FUNCTION public.bookings_status_sync()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.production_status IS DISTINCT FROM OLD.production_status AND NEW.production_status = 'ยกเลิก' THEN
    NEW.queue_status := 'ยกเลิก';
  ELSIF NEW.queue_status = 'ยกเลิก'
        AND OLD.queue_status IS DISTINCT FROM NEW.queue_status
        AND NEW.production_status IS DISTINCT FROM 'เสร็จ'
        AND NEW.production_status IS DISTINCT FROM 'ส่งมอบแล้ว' THEN
    NEW.production_status := 'ยกเลิก';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS bookings_status_sync ON public.bookings;
CREATE TRIGGER bookings_status_sync BEFORE UPDATE OF queue_status, production_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_status_sync();

CREATE OR REPLACE FUNCTION public.holidays_notify_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_conflicts jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'job_id', b.job_id, 'customer_name', b.customer_name, 'brand', b.brand, 'model', b.model,
    'appointment_date', b.appointment_date, 'pickup_date', b.pickup_date,
    'hit', CASE WHEN b.appointment_date = NEW.date AND b.pickup_date = NEW.date THEN 'both'
                WHEN b.appointment_date = NEW.date THEN 'appointment' ELSE 'pickup' END
  )) INTO v_conflicts
  FROM public.bookings b
  WHERE public.booking_uses_slot(b.queue_status, b.production_status)
    AND (b.appointment_date = NEW.date OR b.pickup_date = NEW.date);
  IF v_conflicts IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://xfhpwxjywqgqefbncumm.supabase.co/functions/v1/telegram-notify',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('type', 'HOLIDAY_CONFLICT', 'table', 'holidays',
        'record', row_to_json(NEW), 'bookings', v_conflicts)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS holidays_notify_conflicts ON public.holidays;
CREATE TRIGGER holidays_notify_conflicts AFTER INSERT OR UPDATE OF date ON public.holidays
FOR EACH ROW EXECUTE FUNCTION public.holidays_notify_conflicts();

REVOKE ALL ON FUNCTION public.kmo_next_job_id(text), public.holidays_notify_conflicts(), public.bookings_status_sync()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kmo_next_job_id(text), public.create_booking(jsonb, uuid),
  public.attach_booking_images(uuid, text[]), public.get_booking_day_usage(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(jsonb, uuid), public.attach_booking_images(uuid, text[]),
  public.get_booking_day_usage(date, date) TO anon, authenticated, service_role;
