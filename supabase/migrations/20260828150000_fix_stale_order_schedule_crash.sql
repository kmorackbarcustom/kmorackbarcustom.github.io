-- fix: one stale in_progress order with a past-due due_date could crash
-- rebuild_production_schedule() for EVERY customer trying to place a new
-- order, because create_customer_order() calls rebuild_production_schedule()
-- unconditionally on every submission, and that function re-schedules ALL
-- in_progress orders, not just the new one.
--
-- The Shopee branch already had a graceful fallback (exception when others
-- then compress into the available window near due_date) for exactly this
-- situation. The "customer" (non-Shopee) branch never got the same
-- treatment - this migration brings it in line so a single stuck order can
-- never again take down order creation for the whole shop.
--
-- Root cause hit in production 2026-08-28: order ORD-20260816-F750
-- (0f71a3b8-61d6-42ff-a5f4-9886efda35d9) sat in_progress past its due_date
-- and blocked every subsequent create_customer_order() call.

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

  delete from public.production_allocations where true;

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
        -- ponytail: same graceful-degrade the Shopee branch already had - a stale
        -- in_progress order whose due_date has already slipped into the past
        -- can't be scheduled backward from it, so compress what's left into the
        -- window between today and the (now-overdue) due_date instead of
        -- crashing the whole rebuild for every other order in the shop.
        for v_due in
          select generate_series(
            greatest(public.kmo_today(), v_order.due_date - (public.kmo_production_days(v_order.unit) - 1)),
            greatest(public.kmo_today(), v_order.due_date),
            interval '1 day'
          )::date
        loop
          insert into public.production_allocations (order_id, work_date, units, source)
          values (v_order.id, v_due, public.kmo_daily_allocation_units(v_order.unit), 'customer')
          on conflict (order_id, work_date)
          do update set units = excluded.units;
        end loop;

        update public.orders
          set start_date = greatest(public.kmo_today(), v_order.due_date - (public.kmo_production_days(v_order.unit) - 1)),
              due_date = greatest(public.kmo_today(), v_order.due_date)
        where id = v_order.id;
      end;
    end if;
  end loop;

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
