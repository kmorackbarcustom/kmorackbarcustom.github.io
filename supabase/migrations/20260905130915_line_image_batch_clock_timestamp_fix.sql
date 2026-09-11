-- Discovered during manual concurrency smoke-testing of the previous migration
-- (line_image_batch_and_atomic_history): now() returns the transaction START time in Postgres,
-- not wall-clock time, so two appends inside a single transaction get an identical updated_at,
-- which breaks the claim RPC's "is anything newer than me" comparison. Each production RPC call
-- is its own PostgREST transaction so this wasn't an observed failure, but clock_timestamp()
-- (advances on every call) closes the gap for free - no reason to leave it fragile.
alter table public.line_image_batches
  alter column created_at set default clock_timestamp(),
  alter column updated_at set default clock_timestamp();

create or replace function public.line_image_batch_append(
  p_line_uid text,
  p_message_id text,
  p_reply_token text,
  p_event_timestamp bigint,
  p_provider_type text default null
) returns public.line_image_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.line_image_batches;
  v_item jsonb := jsonb_build_object(
    'message_id', p_message_id,
    'reply_token', p_reply_token,
    'timestamp', p_event_timestamp,
    'provider_type', p_provider_type
  );
begin
  insert into public.line_image_batches (line_uid, items, updated_at)
  values (p_line_uid, jsonb_build_array(v_item), clock_timestamp())
  on conflict (line_uid) do update set
    items = case
      when exists (
        select 1 from jsonb_array_elements(line_image_batches.items) e
        where e->>'message_id' = p_message_id
      ) then line_image_batches.items
      else line_image_batches.items || jsonb_build_array(v_item)
    end,
    updated_at = case
      when exists (
        select 1 from jsonb_array_elements(line_image_batches.items) e
        where e->>'message_id' = p_message_id
      ) then line_image_batches.updated_at
      else clock_timestamp()
    end
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.line_image_batch_claim(
  p_line_uid text,
  p_since timestamptz,
  p_max_wait_seconds integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
begin
  delete from public.line_image_batches
  where line_uid = p_line_uid
    and (
      updated_at <= p_since
      or created_at < clock_timestamp() - make_interval(secs => p_max_wait_seconds)
    )
  returning items into v_items;
  return v_items;
end;
$$;