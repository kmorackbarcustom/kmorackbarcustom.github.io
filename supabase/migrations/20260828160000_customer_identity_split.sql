-- KMO identity model fix (bug K.9): "LINE display name" and "real name from booking form"
-- were both being written to customers.name and clobbering each other depending on which
-- event landed last. Split them into two owned fields:
--   customers.name              -> real name, owned by the booking form (kmo_sync_customer_from_booking)
--   customers.line_display_name -> LINE profile name, owned ONLY by line-webhook / getProfile()
-- Deployed: 2026-08-28 (agent-upgrade Phase 1) — production xfhpwxjywqgqefbncumm

alter table public.customers add column if not exists line_display_name text;

-- Trigger body is unchanged in logic. The insert column list is spelled out so it is obvious
-- that line_display_name is intentionally absent here: the booking sync must NEVER touch it.
-- If you add write logic for line_display_name below, you are re-introducing bug K.9. Don't.
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
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.line_uid is null or new.line_uid = '' then
    return new;
  end if;

  v_name  := nullif(trim(coalesce(new.customer_name, '')), '');
  v_phone := nullif(trim(coalesce(new.phone, '')), '');

  -- Booking form owns `name` and `phone` only. line_display_name deliberately omitted.
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
$$;

revoke execute on function public.kmo_sync_customer_from_booking() from public, anon, authenticated;

-- ---- Backfill --------------------------------------------------------------------------
-- Step 1: seed line_display_name from the current name for every LINE customer. For rows
-- with no booking, `name` was never clobbered (the clobber only happens via the booking
-- trigger), so it still holds the true LINE name. For rows with a booking this is a best
-- guess that the one-off getProfile() backfill script then corrects against the LINE API.
update public.customers
   set line_display_name = name
 where line_uid is not null
   and line_display_name is null;

-- Step 2: restore `name` to the authoritative real name from the latest booking, for any
-- customer whose `name` may have been overwritten with their LINE display name.
update public.customers c
   set name = sub.customer_name,
       updated_at = now()
  from (
    select distinct on (line_uid) line_uid, customer_name
      from public.bookings
     where line_uid is not null
       and nullif(trim(coalesce(customer_name, '')), '') is not null
     order by line_uid, created_at desc
  ) sub
 where c.line_uid = sub.line_uid
   and c.name is distinct from sub.customer_name;
