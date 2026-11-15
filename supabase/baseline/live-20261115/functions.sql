-- baseline นิยาม function ฝั่งจอง+คิวผลิต (ดึงสดแบบ read-only)

-- ==== function public.calculate_queue() ====
-- owner=postgres security_definer=false volatility=v config=- acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.calculate_queue()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  daily_capacity NUMERIC := 2;
  r RECORD;
  d DATE;
  cap_used NUMERIC;
  remaining NUMERIC;
  work_unit NUMERIC;
  started BOOLEAN;
  days_diff INT;
  s_date DATE;
  prod_days INT;
  fd DATE;
BEGIN
  FOR r IN
    SELECT * FROM orders
    WHERE priority = 'shopee'
      AND shopee_deadline IS NOT NULL
      AND status != 'done'
  LOOP
    days_diff := r.shopee_deadline - CURRENT_DATE;
    IF days_diff <= 3 THEN
      s_date := CURRENT_DATE;
    ELSE
      s_date := r.shopee_deadline - 3;
      IF EXTRACT(DOW FROM s_date) = 2 THEN
        s_date := s_date - 1;
      END IF;
    END IF;
    UPDATE orders
    SET due_date = r.shopee_deadline,
        start_date = s_date
    WHERE id = r.id;
  END LOOP;

  UPDATE orders
  SET start_date = NULL,
      due_date = NULL
  WHERE priority != 'shopee'
    AND status = 'pending';

  d := CURRENT_DATE;
  FOR r IN
    SELECT * FROM orders
    WHERE priority != 'shopee'
      AND status = 'pending'
    ORDER BY created_at ASC
  LOOP
    work_unit := r.unit;
    started := FALSE;
    WHILE work_unit > 0 LOOP
      IF EXTRACT(DOW FROM d) = 2 THEN
        d := d + 1;
      END IF;
      SELECT COALESCE(SUM(unit), 0) INTO cap_used
      FROM orders
      WHERE due_date = d
        AND status != 'done'
        AND (priority = 'shopee' OR status = 'in_progress');
      remaining := daily_capacity - cap_used;
      IF remaining <= 0 THEN
        d := d + 1;
        CONTINUE;
      END IF;
      IF NOT started THEN
        UPDATE orders SET start_date = d WHERE id = r.id;
        started := TRUE;
      END IF;
      IF work_unit <= remaining THEN
        work_unit := 0;
      ELSE
        work_unit := work_unit - remaining;
        d := d + 1;
      END IF;
    END LOOP;
    prod_days := CASE WHEN r.unit <= 0.5 THEN 2 ELSE 3 END;
    SELECT start_date INTO fd FROM orders WHERE id = r.id;
    WHILE prod_days > 0 LOOP
      fd := fd + 1;
      IF EXTRACT(DOW FROM fd) != 2 THEN
        prod_days := prod_days - 1;
      END IF;
    END LOOP;
    UPDATE orders SET due_date = fd WHERE id = r.id;
  END LOOP;
END;
$function$
;

-- ==== function public.check_queue_availability(p_appoint_date date, p_pickup_date date, p_exclude_booking_id integer) ====
-- owner=postgres security_definer=false volatility=v config=- acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.check_queue_availability(p_appoint_date date, p_pickup_date date, p_exclude_booking_id integer DEFAULT NULL::integer)
 RETURNS TABLE(date date, available_slots integer, booked_count integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(
      p_appoint_date,
      p_pickup_date - INTERVAL '1 day',
      '1 day'::INTERVAL
    )::DATE as check_date
  ),
  daily_bookings AS (
    SELECT
      d.check_date,
      COUNT(b.id) as count_booked
    FROM date_range d
    LEFT JOIN bookings b ON (
      b.queue_status = 'ยืนยัน' AND
      d.check_date >= b.appointment_date AND
      d.check_date < b.pickup_date AND
      (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id)
    )
    GROUP BY d.check_date
  )
  SELECT
    db.check_date as date,
    (3 - COALESCE(db.count_booked, 0))::INTEGER as available_slots,
    COALESCE(db.count_booked, 0)::INTEGER as booked_count
  FROM daily_bookings db
  ORDER BY db.check_date;
END;
$function$
;

-- ==== function public.create_customer_order(p_payload jsonb) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_customer_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_order public.orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  v_id := public.kmo_insert_order_from_payload(p_payload, false);
  perform public.rebuild_production_schedule();

  select * into v_order from public.orders where id = v_id;
  if nullif(v_order.order_id, '') is null then
    raise exception 'Order ID was not generated';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'order_id', v_order.order_id,
    'start_date', v_order.start_date,
    'due_date', v_order.due_date
  );
end;
$function$
;

-- ==== function public.create_shopee_order(p_payload jsonb) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_shopee_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_order public.orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  if nullif(p_payload->>'shopee_deadline', '') is null then
    raise exception 'Shopee deadline is required';
  end if;

  v_id := public.kmo_insert_order_from_payload(
    p_payload || jsonb_build_object('channel', 'Shopee', 'priority', 'shopee', 'status', 'pending'),
    true
  );

  -- 🔒 LOCK: ไม่เรียก rebuild_production_schedule() — คิวจัดมือโดย Mark-1 หลังเช็ค
  select * into v_order from public.orders where id = v_id;
  return jsonb_build_object(
    'id', v_order.id,
    'order_id', v_order.order_id,
    'start_date', v_order.start_date,
    'due_date', v_order.due_date,
    'shopee_deadline', v_order.shopee_deadline
  );
end;
$function$
;

-- ==== function public.generate_job_id(p_platform text) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

-- ==== function public.get_booking_availability(p_start date, p_end date) ====
-- owner=postgres security_definer=true volatility=s config=search_path=public acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_booking_availability(p_start date, p_end date)
 RETURNS TABLE(appointment_date date, pickup_date date, queue_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.appointment_date, b.pickup_date, b.queue_status
  FROM public.bookings b
  WHERE b.appointment_date <= p_end AND b.pickup_date >= p_start;
$function$
;

-- ==== function public.get_daily_summary(p_date date) ====
-- owner=postgres security_definer=false volatility=v config=- acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_daily_summary(p_date date)
 RETURNS TABLE(pending_jobs text, today_appointments text, pending_count integer, today_count integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  pending_list TEXT := '';
  today_list TEXT := '';
  p_count INT := 0;
  t_count INT := 0;
  rec RECORD;
BEGIN
  -- งานค้าง (production_status = กำลังทำ AND queue_status = ยืนยัน)
  FOR rec IN
    SELECT
      job_id,
      customer_name,
      brand,
      model,
      product,
      color,
      appointment_date,
      pickup_date
    FROM bookings
    WHERE production_status = 'กำลังทำ'
      AND queue_status = 'ยืนยัน'
    ORDER BY appointment_date, created_at
  LOOP
    p_count := p_count + 1;
    pending_list := pending_list || rec.job_id || ' / ' ||
                    COALESCE(rec.customer_name, '-') || ' / ' ||
                    COALESCE(rec.brand, '-') || ' ' || COALESCE(rec.model, '-') || ' / ' ||
                    COALESCE(rec.product, '-') || ' / ' ||
                    COALESCE(rec.color, '-') || ' / นัด ' ||
                    TO_CHAR(rec.appointment_date, 'DD/MM/YYYY') || ' / รับ ' ||
                    TO_CHAR(rec.pickup_date, 'DD/MM/YYYY') || E'\n';
  END LOOP;

  -- ลูกค้านัดวันนี้
  FOR rec IN
    SELECT
      job_id,
      customer_name,
      brand,
      model,
      product,
      color,
      appointment_date,
      pickup_date
    FROM bookings
    WHERE appointment_date = p_date
      AND queue_status = 'ยืนยัน'
    ORDER BY created_at
  LOOP
    t_count := t_count + 1;
    today_list := today_list || rec.job_id || ' / ' ||
                  COALESCE(rec.customer_name, '-') || ' / ' ||
                  COALESCE(rec.brand, '-') || ' ' || COALESCE(rec.model, '-') || ' / ' ||
                  COALESCE(rec.product, '-') || ' / ' ||
                  COALESCE(rec.color, '-') || ' / นัด ' ||
                  TO_CHAR(rec.appointment_date, 'DD/MM/YYYY') || ' / รับ ' ||
                  TO_CHAR(rec.pickup_date, 'DD/MM/YYYY') || E'\n';
  END LOOP;

  -- Return results
  RETURN QUERY SELECT
    CASE WHEN pending_list = '' THEN '-' ELSE TRIM(pending_list) END,
    CASE WHEN today_list = '' THEN '-' ELSE TRIM(today_list) END,
    p_count,
    t_count;
END;
$function$
;

-- ==== function public.get_schedule_health() ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_schedule_health()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'work_date', work_date,
      'total_units', total_units,
      'shopee_units', shopee_units,
      'customer_units', customer_units,
      'over_units', greatest(0, total_units - 2.5),
      'reason', case
        when shopee_units > 2.5 then 'shopee_over_capacity'
        else 'over_capacity'
      end
    )
    order by work_date
  ), '[]'::jsonb)
  from (
    select
      work_date,
      sum(units)::numeric(6,2) as total_units,
      sum(units) filter (where source = 'shopee')::numeric(6,2) as shopee_units,
      sum(units) filter (where source = 'customer')::numeric(6,2) as customer_units
    from public.production_allocations
    group by work_date
    having sum(units) > 2.5
  ) x;
$function$
;

-- ==== function public.get_upcoming_queue_density(from_date date, days integer) ====
-- owner=postgres security_definer=false volatility=s config=- acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_upcoming_queue_density(from_date date, days integer DEFAULT 7)
 RETURNS TABLE(work_date date, units numeric, is_over_capacity boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select
    d::date as work_date,
    coalesce(sum(pa.units), 0)::numeric(6,2) as units,
    coalesce(sum(pa.units), 0) > 2.5 as is_over_capacity
  from generate_series(from_date, from_date + (days - 1), interval '1 day') d
  left join public.production_allocations pa on pa.work_date = d::date
  group by d
  order by d;
$function$
;

-- ==== function public.kmo_allocate_backward(p_order_id uuid, p_units numeric, p_due_date date, p_source text) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_allocate_backward(p_order_id uuid, p_units numeric, p_due_date date, p_source text)
 RETURNS TABLE(start_date date, due_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days integer := public.kmo_production_days(p_units);
  v_daily_units numeric := public.kmo_daily_allocation_units(p_units);
  v_remaining integer := v_days;
  v_day date := p_due_date;
begin
  if coalesce(p_units, 0) <= 0 then
    raise exception 'Order units must be greater than 0';
  end if;
  if p_due_date is null then
    raise exception 'Due date is required';
  end if;

  due_date := p_due_date;

  while v_remaining > 0 loop
    if v_day < public.kmo_today() then
      raise exception 'Not enough days before due date % for order %', p_due_date, p_order_id;
    end if;

    if public.kmo_day_has_capacity(v_day, v_daily_units) then
      insert into public.production_allocations (order_id, work_date, units, source)
      values (p_order_id, v_day, v_daily_units, p_source)
      on conflict (order_id, work_date)
      do update set units = excluded.units;

      start_date := v_day;
      v_remaining := v_remaining - 1;
    end if;

    v_day := v_day - 1;
  end loop;

  return next;
end;
$function$
;

-- ==== function public.kmo_allocate_forward(p_order_id uuid, p_units numeric, p_earliest date) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_allocate_forward(p_order_id uuid, p_units numeric, p_earliest date)
 RETURNS TABLE(start_date date, due_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_days integer := public.kmo_production_days(p_units);
  v_daily_units numeric := public.kmo_daily_allocation_units(p_units);
  v_remaining integer := v_days;
  v_day date := greatest(coalesce(p_earliest, public.kmo_today() + 1), public.kmo_today() + 1);
begin
  if coalesce(p_units, 0) <= 0 then
    raise exception 'Order units must be greater than 0';
  end if;

  while v_remaining > 0 loop
    if v_day > public.kmo_today() + 180 then
      raise exception 'Production queue is full for the next 180 days';
    end if;

    if public.kmo_day_has_capacity(v_day, v_daily_units) then
      insert into public.production_allocations (order_id, work_date, units, source)
      values (p_order_id, v_day, v_daily_units, 'customer')
      on conflict (order_id, work_date)
      do update set units = excluded.units;

      if start_date is null then
        start_date := v_day;
      end if;
      due_date := v_day;
      v_remaining := v_remaining - 1;
    end if;

    v_day := v_day + 1;
  end loop;

  return next;
end;
$function$
;

-- ==== function public.kmo_daily_allocation_units(p_units numeric) ====
-- owner=postgres security_definer=false volatility=i config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_daily_allocation_units(p_units numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when coalesce(p_units, 0) <= 0 then 0
    when p_units <= 0.5 then 0.5
    else 1
  end;
$function$
;

-- ==== function public.kmo_day_has_capacity(p_day date, p_units numeric) ====
-- owner=postgres security_definer=false volatility=s config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_day_has_capacity(p_day date, p_units numeric)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((select sum(pa.units) from public.production_allocations pa where pa.work_date = p_day), 0) + p_units <= 3.0;
$function$
;

-- ==== function public.kmo_insert_order_from_payload(p_payload jsonb, p_is_shopee boolean) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_insert_order_from_payload(p_payload jsonb, p_is_shopee boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_items_type text;
  v_items_text text[];
  v_order_id text := nullif(p_payload->>'order_id', '');
begin
  select data_type
    into v_items_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'orders'
    and column_name = 'items';

  select coalesce(array_agg(value), array[]::text[])
    into v_items_text
  from jsonb_array_elements_text(coalesce(p_payload->'items', '[]'::jsonb));

  if p_is_shopee and v_order_id is null then
    v_order_id := 'SHP-' || to_char(public.kmo_today(), 'YYYYMMDD') || '-' ||
      upper(right(coalesce(p_payload->>'shopee_order_id', md5(random()::text)), 4));
    if exists (select 1 from public.orders where order_id = v_order_id) then
      v_order_id := v_order_id || '-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 4));
    end if;
  end if;

  if not p_is_shopee and v_order_id is null then
    v_order_id := 'ORD-' || to_char(public.kmo_today(), 'YYYYMMDD') || '-' ||
      upper(substr(md5(clock_timestamp()::text || random()::text), 1, 4));
    while exists (select 1 from public.orders where order_id = v_order_id) loop
      v_order_id := 'ORD-' || to_char(public.kmo_today(), 'YYYYMMDD') || '-' ||
        upper(substr(md5(clock_timestamp()::text || random()::text), 1, 4));
    end loop;
  end if;

  if v_items_type = 'ARRAY' then
    insert into public.orders (
      customer_name, contact, channel, brand, model, items, color, unit,
      payment_type, delivery_type, delivery_address, status, priority,
      shopee_order_id, shopee_deadline, due_date, order_id,
      cart_meta, estimated_total, source_page,
      line_user_id, line_linked_at
    )
    values (
      coalesce(p_payload->>'customer_name', case when p_is_shopee then 'Shopee' else null end),
      nullif(p_payload->>'contact', ''),
      coalesce(p_payload->>'channel', case when p_is_shopee then 'Shopee' else null end),
      p_payload->>'brand',
      p_payload->>'model',
      v_items_text,
      p_payload->>'color',
      nullif(p_payload->>'unit', '')::numeric,
      nullif(p_payload->>'payment_type', ''),
      nullif(p_payload->>'delivery_type', ''),
      nullif(p_payload->>'delivery_address', ''),
      coalesce(nullif(p_payload->>'status', ''), 'pending'),
      coalesce(nullif(p_payload->>'priority', ''), case when p_is_shopee then 'shopee' else 'normal' end),
      nullif(p_payload->>'shopee_order_id', ''),
      nullif(p_payload->>'shopee_deadline', '')::date,
      case when p_is_shopee then nullif(p_payload->>'shopee_deadline', '')::date else null end,
      v_order_id,
      p_payload->'cart_meta',
      nullif(p_payload->>'estimated_total', '')::numeric,
      nullif(p_payload->>'source_page', ''),
      nullif(p_payload->>'line_user_id', ''),
      case when nullif(p_payload->>'line_user_id', '') is not null then now() else null end
    )
    returning id into v_id;
  else
    insert into public.orders (
      customer_name, contact, channel, brand, model, items, color, unit,
      payment_type, delivery_type, delivery_address, status, priority,
      shopee_order_id, shopee_deadline, due_date, order_id,
      cart_meta, estimated_total, source_page,
      line_user_id, line_linked_at
    )
    values (
      coalesce(p_payload->>'customer_name', case when p_is_shopee then 'Shopee' else null end),
      nullif(p_payload->>'contact', ''),
      coalesce(p_payload->>'channel', case when p_is_shopee then 'Shopee' else null end),
      p_payload->>'brand',
      p_payload->>'model',
      coalesce(p_payload->'items', '[]'::jsonb),
      p_payload->>'color',
      nullif(p_payload->>'unit', '')::numeric,
      nullif(p_payload->>'payment_type', ''),
      nullif(p_payload->>'delivery_type', ''),
      nullif(p_payload->>'delivery_address', ''),
      coalesce(nullif(p_payload->>'status', ''), 'pending'),
      coalesce(nullif(p_payload->>'priority', ''), case when p_is_shopee then 'shopee' else 'normal' end),
      nullif(p_payload->>'shopee_order_id', ''),
      nullif(p_payload->>'shopee_deadline', '')::date,
      case when p_is_shopee then nullif(p_payload->>'shopee_deadline', '')::date else null end,
      v_order_id,
      p_payload->'cart_meta',
      nullif(p_payload->>'estimated_total', '')::numeric,
      nullif(p_payload->>'source_page', ''),
      nullif(p_payload->>'line_user_id', ''),
      case when nullif(p_payload->>'line_user_id', '') is not null then now() else null end
    )
    returning id into v_id;
  end if;

  update public.orders
    set order_id = 'ORD-' || to_char(public.kmo_today(), 'YYYYMMDD') || '-' || upper(substr(md5(v_id::text), 1, 4))
  where id = v_id
    and nullif(order_id, '') is null;

  return v_id;
end;
$function$
;

-- ==== function public.kmo_order_effective_due(p_order orders) ====
-- owner=postgres security_definer=false volatility=s config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_order_effective_due(p_order orders)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_order.channel = 'Shopee' or p_order.priority = 'shopee'
      then coalesce(p_order.shopee_deadline, p_order.due_date)
    else coalesce(p_order.due_date, p_order.shopee_deadline)
  end;
$function$
;

-- ==== function public.kmo_production_days(p_units numeric) ====
-- owner=postgres security_definer=false volatility=i config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_production_days(p_units numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when coalesce(p_units, 0) <= 0 then 0
    when p_units <= 0.5 then 1
    else ceil(p_units * 3)::integer
  end;
$function$
;

-- ==== function public.kmo_sync_customer_from_booking() ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_sync_customer_from_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_customer_id uuid;
  v_name text;
  v_phone text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.line_uid is null or new.line_uid = '' then
    return new;
  end if;

  v_name  := nullif(trim(coalesce(new.customer_name, '')), '');
  v_phone := nullif(trim(coalesce(new.phone, '')), '');

  -- Booking form owns `name` and `phone` only. line_display_name deliberately omitted.
  -- Adding write logic for line_display_name here re-introduces bug K.9.
  insert into public.customers (line_uid, platform, name, phone)
  values (new.line_uid, 'line', v_name, v_phone)
  on conflict (line_uid) do update
    set name  = coalesce(nullif(excluded.name, ''), customers.name, excluded.name),
        phone = coalesce(nullif(excluded.phone, ''), customers.phone, excluded.phone),
        updated_at = now()
  returning id into v_customer_id;

  if v_customer_id is not null and new.customer_id is distinct from v_customer_id then
    update public.bookings
      set customer_id = v_customer_id,
          updated_at  = now()
    where id = new.id;
  end if;

  return new;
end;
$function$
;

-- ==== function public.kmo_today() ====
-- owner=postgres security_definer=false volatility=s config=search_path=public, pg_temp acl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kmo_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (now() at time zone 'Asia/Bangkok')::date;
$function$
;

-- ==== function public.notify_telegram_booking() ====
-- owner=postgres security_definer=true volatility=v config=search_path=public acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_telegram_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := 'https://xfhpwxjywqgqefbncumm.supabase.co/functions/v1/telegram-notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := json_build_object(
                 'type',   'INSERT',
                 'table',  'bookings',
                 'record', row_to_json(NEW)
               )::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

-- ==== function public.notify_telegram_order() ====
-- owner=postgres security_definer=true volatility=v config=search_path=public acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_telegram_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url := 'https://xfhpwxjywqgqefbncumm.supabase.co/functions/v1/telegram-notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'type', 'INSERT',
      'table', 'orders',
      'record', row_to_json(new)
    )::jsonb
  );

  return new;
exception when others then
  return new;
end;
$function$
;

-- ==== function public.rebuild_production_schedule() ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rebuild_production_schedule()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_alloc record;
  v_due date;
  v_changed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  -- 🔒 LOCK: ลบเฉพาะ allocation ของออเดอร์ที่จบ/ยกเลิกเท่านั้น (ไม่ลบทั้งระบบ)
  delete from public.production_allocations pa
  where exists (
    select 1 from public.orders o
    where o.id = pa.order_id
      and o.status in ('done', 'completed', 'cancelled', 'canceled')
  );

  -- customer in_progress: เฉพาะตัวที่ยังไม่มี allocation
  for v_order in
    select o.*
    from public.orders o
    where o.status = 'in_progress'
      and coalesce(o.channel, '') <> 'Shopee'
      and coalesce(o.priority, '') <> 'shopee'
      and not exists (select 1 from public.production_allocations pa where pa.order_id = o.id)
    order by o.created_at, o.id
  loop
    if v_order.start_date is not null and v_order.due_date is not null and v_order.due_date >= v_order.start_date then
      for v_due in
        select generate_series(v_order.start_date, v_order.due_date, interval '1 day')::date
      loop
        insert into public.production_allocations (order_id, work_date, units, source)
        values (v_order.id, v_due, public.kmo_daily_allocation_units(v_order.unit), 'customer')
        on conflict (order_id, work_date)
        do update set units = excluded.units;
      end loop;
    elsif v_order.due_date is not null then
      begin
        select *
          into v_alloc
        from public.kmo_allocate_backward(
          v_order.id,
          v_order.unit,
          v_order.due_date,
          'customer'
        );
        update public.orders
          set start_date = v_alloc.start_date,
              due_date = v_alloc.due_date
        where id = v_order.id;
      exception when others then
        raise notice 'rebuild_production_schedule: skipping stale in_progress order % (due_date % already past, cannot backward-allocate) - left untouched', v_order.id, v_order.due_date;
      end;
    end if;
  end loop;

  -- pending customer: เฉพาะตัวที่ยังไม่มี allocation
  for v_order in
    select o.*
    from public.orders o
    where o.status = 'pending'
      and coalesce(o.channel, '') <> 'Shopee'
      and coalesce(o.priority, '') <> 'shopee'
      and not exists (select 1 from public.production_allocations pa where pa.order_id = o.id)
    order by o.created_at, o.id
  loop
    select *
      into v_alloc
    from public.kmo_allocate_forward(
      v_order.id,
      v_order.unit,
      public.kmo_today() + 1
    );

    if v_order.start_date is distinct from v_alloc.start_date
       or v_order.due_date is distinct from v_alloc.due_date then
      update public.orders
        set start_date = v_alloc.start_date,
            due_date = v_alloc.due_date
      where id = v_order.id;
      v_changed_count := v_changed_count + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'changed_count', v_changed_count);
end;
$function$
;

-- ==== function public.update_order_status(p_order_id uuid, p_status text) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  update public.orders
    set status = p_status
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Order not found';
  end if;

  perform public.rebuild_production_schedule();
  select * into v_order from public.orders where id = p_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_id', v_order.order_id,
    'status', v_order.status,
    'start_date', v_order.start_date,
    'due_date', v_order.due_date
  );
end;
$function$
;

-- ==== function public.update_shopee_deadline(p_order_id uuid, p_deadline date) ====
-- owner=postgres security_definer=true volatility=v config=search_path=public, pg_temp acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_shopee_deadline(p_order_id uuid, p_deadline date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  update public.orders
    set shopee_deadline = p_deadline,
        due_date = p_deadline,
        priority = 'shopee',
        channel = 'Shopee'
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Shopee order not found';
  end if;

  perform public.rebuild_production_schedule();
  select * into v_order from public.orders where id = p_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_id', v_order.order_id,
    'start_date', v_order.start_date,
    'due_date', v_order.due_date,
    'shopee_deadline', v_order.shopee_deadline
  );
end;
$function$
;

-- ==== function public.update_updated_at() ====
-- owner=postgres security_definer=false volatility=v config=- acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
