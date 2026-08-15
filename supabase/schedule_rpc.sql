-- KMO production scheduling RPCs
-- Run this in the Supabase SQL editor for project xfhpwxjywqgqefbncumm.
--
-- ⚠️ Before re-running this whole file: functions here are also edited piecemeal
-- via supabase/migrations/*.sql. Diff each function below against its latest
-- migration first, or a re-run will silently revert those changes (no error —
-- CREATE OR REPLACE just overwrites). Last synced: 2026-08-15 (line_user_id /
-- line_linked_at from 20260814130000_order_capture_line_uid.sql; kmo_day_has_capacity
-- cap + rebuild_production_schedule fair-queue rewrite from
-- 20260815130000_shopee_fair_queue_cap_increase.sql).

create extension if not exists pgcrypto;

create or replace function public.kmo_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

create table if not exists public.production_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  work_date date not null,
  units numeric(6,2) not null check (units > 0),
  source text not null check (source in ('shopee', 'customer')),
  created_at timestamptz not null default now(),
  unique (order_id, work_date)
);

create index if not exists production_allocations_work_date_idx
  on public.production_allocations (work_date);

create index if not exists production_allocations_order_id_idx
  on public.production_allocations (order_id);

alter table public.production_allocations enable row level security;

alter table public.orders
  add column if not exists cart_meta jsonb,
  add column if not exists estimated_total numeric,
  add column if not exists source_page text;

alter table public.bookings
  add column if not exists cart_meta jsonb,
  add column if not exists estimated_total numeric,
  add column if not exists source_page text;

create or replace function public.kmo_order_effective_due(p_order public.orders)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_order.channel = 'Shopee' or p_order.priority = 'shopee'
      then coalesce(p_order.shopee_deadline, p_order.due_date)
    else coalesce(p_order.due_date, p_order.shopee_deadline)
  end;
$$;

create or replace function public.kmo_production_days(p_units numeric)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_units, 0) <= 0 then 0
    when p_units <= 0.5 then 1
    else ceil(p_units * 3)::integer
  end;
$$;

create or replace function public.kmo_day_has_capacity(p_day date, p_units numeric)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select sum(pa.units) from public.production_allocations pa where pa.work_date = p_day), 0) + p_units <= 3.0;
$$;

create or replace function public.kmo_daily_allocation_units(p_units numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_units, 0) <= 0 then 0
    when p_units <= 0.5 then 0.5
    else 1
  end;
$$;

create or replace function public.kmo_allocate_forward(
  p_order_id uuid,
  p_units numeric,
  p_earliest date
)
returns table(start_date date, due_date date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.kmo_allocate_backward(
  p_order_id uuid,
  p_units numeric,
  p_due_date date,
  p_source text
)
returns table(start_date date, due_date date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.rebuild_production_schedule()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_alloc record;
  v_due date;
  v_changed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('kmo_production_schedule'));

  -- Allocations are derived data. Rebuild from scratch so done/cancelled
  -- orders never leave stale capacity behind.
  delete from public.production_allocations where true;

  -- Step 1: in_progress Shopee orders - keep deadline-driven schedule.
  for v_order in
    select o.*
    from public.orders o
    where o.status = 'in_progress'
      and (o.channel = 'Shopee' or o.priority = 'shopee')
    order by public.kmo_order_effective_due(o), o.created_at, o.id
  loop
    v_due := public.kmo_order_effective_due(v_order);

    update public.orders
      set due_date = v_due,
          priority = 'shopee'
    where id = v_order.id;

    if v_due is not null and coalesce(v_order.unit, 0) > 0 then
      begin
        select *
          into v_alloc
        from public.kmo_allocate_backward(v_order.id, v_order.unit, v_due, 'shopee');

        update public.orders
          set start_date = v_alloc.start_date,
              due_date = v_due
        where id = v_order.id;
      exception when others then
        for v_due in
          select generate_series(
            greatest(public.kmo_today(), public.kmo_order_effective_due(v_order) - (public.kmo_production_days(v_order.unit) - 1)),
            public.kmo_order_effective_due(v_order),
            interval '1 day'
          )::date
        loop
          insert into public.production_allocations (order_id, work_date, units, source)
          values (v_order.id, v_due, public.kmo_daily_allocation_units(v_order.unit), 'shopee')
          on conflict (order_id, work_date)
          do update set units = excluded.units;
        end loop;

        update public.orders
          set start_date = greatest(public.kmo_today(), public.kmo_order_effective_due(v_order) - (public.kmo_production_days(v_order.unit) - 1)),
              due_date = public.kmo_order_effective_due(v_order)
        where id = v_order.id;
      end;
    end if;
  end loop;

  -- Step 2: in_progress non-Shopee - keep committed schedule.
  for v_order in
    select *
    from public.orders
    where status = 'in_progress'
      and coalesce(channel, '') <> 'Shopee'
      and coalesce(priority, '') <> 'shopee'
    order by created_at, id
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
    end if;
  end loop;

  -- Step 3: ALL pending orders, any channel, FIFO by created_at.
  -- Replaces the old "Shopee always first" phase with fairness by default.
  for v_order in
    select *
    from public.orders
    where status = 'pending'
    order by created_at, id
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

  -- Step 4: protection sweep - pull forward any pending Shopee order whose
  -- FIFO slot would miss its platform deadline. Most urgent first. This is
  -- the only place Shopee still jumps the queue, and only when necessary.
  for v_order in
    select *
    from public.orders
    where status = 'pending'
      and (channel = 'Shopee' or priority = 'shopee')
      and shopee_deadline is not null
      and (due_date is null or due_date > shopee_deadline)
    order by shopee_deadline, created_at, id
  loop
    delete from public.production_allocations where order_id = v_order.id;

    if coalesce(v_order.unit, 0) > 0 then
      begin
        select *
          into v_alloc
        from public.kmo_allocate_backward(v_order.id, v_order.unit, v_order.shopee_deadline, 'shopee');

        update public.orders
          set start_date = v_alloc.start_date,
              due_date = v_order.shopee_deadline
        where id = v_order.id;
      exception when others then
        for v_due in
          select generate_series(
            greatest(public.kmo_today(), v_order.shopee_deadline - (public.kmo_production_days(v_order.unit) - 1)),
            v_order.shopee_deadline,
            interval '1 day'
          )::date
        loop
          insert into public.production_allocations (order_id, work_date, units, source)
          values (v_order.id, v_due, public.kmo_daily_allocation_units(v_order.unit), 'shopee')
          on conflict (order_id, work_date)
          do update set units = excluded.units;
        end loop;

        update public.orders
          set start_date = greatest(public.kmo_today(), v_order.shopee_deadline - (public.kmo_production_days(v_order.unit) - 1)),
              due_date = v_order.shopee_deadline
        where id = v_order.id;
      end;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'changed_count', v_changed_count);
end;
$$;

create or replace function public.kmo_insert_order_from_payload(
  p_payload jsonb,
  p_is_shopee boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.create_customer_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.create_shopee_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  perform public.rebuild_production_schedule();

  select * into v_order from public.orders where id = v_id;
  return jsonb_build_object(
    'id', v_order.id,
    'order_id', v_order.order_id,
    'start_date', v_order.start_date,
    'due_date', v_order.due_date,
    'shopee_deadline', v_order.shopee_deadline
  );
end;
$$;

create or replace function public.update_shopee_deadline(p_order_id uuid, p_deadline date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.get_schedule_health()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke execute on function public.kmo_order_effective_due(public.orders) from public, anon, authenticated;
revoke execute on function public.kmo_today() from public, anon, authenticated;
drop function if exists public.kmo_allocate_customer_order(uuid, numeric, date);
drop trigger if exists trigger_queue on public.orders;
revoke execute on function public.kmo_production_days(numeric) from public, anon, authenticated;
revoke execute on function public.kmo_day_has_capacity(date, numeric) from public, anon, authenticated;
revoke execute on function public.kmo_daily_allocation_units(numeric) from public, anon, authenticated;
revoke execute on function public.kmo_allocate_forward(uuid, numeric, date) from public, anon, authenticated;
revoke execute on function public.kmo_allocate_backward(uuid, numeric, date, text) from public, anon, authenticated;
revoke execute on function public.kmo_insert_order_from_payload(jsonb, boolean) from public, anon, authenticated;

grant execute on function public.create_customer_order(jsonb) to anon, authenticated;
grant execute on function public.create_shopee_order(jsonb) to anon, authenticated;
grant execute on function public.update_shopee_deadline(uuid, date) to anon, authenticated;
grant execute on function public.update_order_status(uuid, text) to anon, authenticated;
grant execute on function public.rebuild_production_schedule() to anon, authenticated;
grant execute on function public.get_schedule_health() to anon, authenticated;

create or replace function public.notify_telegram_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists new_booking_notification on public.bookings;
drop trigger if exists on_order_ready_line on public.orders;
drop trigger if exists on_shopee_insert_line on public.orders;
drop function if exists public.notify_new_booking();
drop function if exists public.notify_new_order();

drop trigger if exists on_order_insert on public.orders;
drop trigger if exists trigger_order_new_notification on public.orders;
drop trigger if exists on_shopee_insert_telegram on public.orders;
drop trigger if exists on_order_insert_telegram on public.orders;
drop trigger if exists on_order_ready_telegram on public.orders;

create trigger on_order_insert_telegram
after insert on public.orders
for each row
when (
  new.order_id is not null
  and new.start_date is not null
  and new.due_date is not null
)
execute function public.notify_telegram_order();

create trigger on_order_ready_telegram
after update of order_id, start_date, due_date on public.orders
for each row
when (
  new.order_id is not null
  and new.start_date is not null
  and new.due_date is not null
  and (
    old.order_id is null
    or old.due_date is null
    or old.start_date is null
  )
)
execute function public.notify_telegram_order();
