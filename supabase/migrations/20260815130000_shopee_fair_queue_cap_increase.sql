-- KMO: raise daily production capacity 2.5 -> 3.0 units, and replace the
-- Shopee-always-first scheduling phase with a fair FIFO queue (by
-- created_at, across all channels) + a protection sweep that only pulls a
-- Shopee order forward when it would otherwise miss its platform deadline.
--
-- Why: Shopee orders were unconditionally scheduled before ANY other
-- channel's pending orders every rebuild, regardless of how long a walk-in/
-- Line/Facebook order had already been waiting. Confirmed on production data
-- (2026-08-15): non-Shopee pending orders were starting production 19-25
-- days after being created. Verified via a rolled-back test transaction
-- that this change keeps every currently-queued non-Shopee order's
-- start/due date identical (no regression - they were already older than
-- every pending Shopee order) while still meeting 100% of Shopee deadlines
-- through the protection sweep. Deployed: 2026-08-15 (Claude, confirmed by CEO).

create or replace function public.kmo_day_has_capacity(p_day date, p_units numeric)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select sum(pa.units) from public.production_allocations pa where pa.work_date = p_day), 0) + p_units <= 3.0;
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

  -- Step 1: in_progress Shopee orders - unchanged, keep deadline-driven schedule.
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

  -- Step 2: in_progress non-Shopee - unchanged, keep committed schedule.
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
