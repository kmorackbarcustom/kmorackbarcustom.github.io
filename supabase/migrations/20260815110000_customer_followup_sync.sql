-- KMO: auto-sync ข้อมูลลูกค้าจาก bookings -> customers (match ด้วย line_uid)
-- + ผูก bookings.customer_id ให้ถูกต้อง
-- Deployed: 2026-08-15 (Mark-1 / OpenClaw) — production xfhpwxjywqgqefbncumm

create or replace function public.kmo_sync_customer_from_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_name text;
  v_phone text;
begin
  -- ป้องกัน recursion ถ้า trigger ถูกเรียกซ้อน
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- ต้องมี line_uid ถึงจะผูกได้
  if new.line_uid is null or new.line_uid = '' then
    return new;
  end if;

  v_name  := nullif(trim(coalesce(new.customer_name, '')), '');
  v_phone := nullif(trim(coalesce(new.phone, '')), '');

  -- upsert customers ตาม line_uid (unique constraint customers_line_uid_key)
  insert into public.customers (line_uid, platform, name, phone)
  values (new.line_uid, 'line', v_name, v_phone)
  on conflict (line_uid) do update
    set name  = coalesce(nullif(excluded.name, ''), customers.name, excluded.name),
        phone = coalesce(nullif(excluded.phone, ''), customers.phone, excluded.phone),
        updated_at = now()
  returning id into v_customer_id;

  -- ผูก booking -> customer (เฉพาะเมื่อยังไม่ผูก หรือผูกคนละตัว)
  if v_customer_id is not null and new.customer_id is distinct from v_customer_id then
    update public.bookings
      set customer_id = v_customer_id,
          updated_at  = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_customer_from_booking on public.bookings;

create trigger trg_sync_customer_from_booking
after insert or update of line_uid, customer_name, phone on public.bookings
for each row
when (new.line_uid is not null and new.line_uid <> '')
execute function public.kmo_sync_customer_from_booking();

revoke execute on function public.kmo_sync_customer_from_booking() from public, anon, authenticated;
