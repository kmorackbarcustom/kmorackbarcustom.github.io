-- Extends kmo_insert_order_from_payload to persist line_user_id (and stamp
-- line_linked_at) when the client supplies it, so CustomerOrder.html's new
-- LIFF gate can capture the customer's LINE userId at order-submission time,
-- same as bookings already do via booking.html. Full function body preserved
-- from schedule_rpc.sql - only the two new columns/values are added.
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
