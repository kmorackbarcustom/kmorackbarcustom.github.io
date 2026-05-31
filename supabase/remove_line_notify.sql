drop trigger if exists new_booking_notification on public.bookings;
drop trigger if exists on_order_ready_line on public.orders;
drop trigger if exists on_shopee_insert_line on public.orders;
drop function if exists public.notify_new_booking();
drop function if exists public.notify_new_order();

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
