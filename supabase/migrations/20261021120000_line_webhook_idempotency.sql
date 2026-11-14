-- Durable LINE event claims and delivery outcomes. Store provider event IDs and operational
-- state only; never persist message contents, reply tokens, or LINE user IDs here.
create table if not exists public.line_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'delivery_uncertain', 'delivery_failed', 'failed_retryable')),
  delivery_status text not null default 'not_attempted'
    check (delivery_status in (
      'not_attempted', 'reply_pending', 'reply_accepted', 'reply_rejected',
      'reply_uncertain', 'push_pending', 'push_accepted', 'push_rejected', 'push_uncertain'
    )),
  last_error_code text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  processing_started_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.line_webhook_events enable row level security;
revoke all on table public.line_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.line_webhook_events to service_role;
create index if not exists line_webhook_events_created_at_idx
  on public.line_webhook_events (created_at);

create or replace function public.line_webhook_event_claim(
  p_event_id text,
  p_event_type text,
  p_reclaim_after_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.line_webhook_events;
  v_reclaim_seconds integer := greatest(60, least(coalesce(p_reclaim_after_seconds, 600), 1800));
begin
  if p_event_id is null or length(p_event_id) = 0 or length(p_event_id) > 128 then
    raise exception 'invalid LINE webhook event ID';
  end if;

  insert into public.line_webhook_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('claimed', true, 'status', v_row.status, 'attempt_count', v_row.attempt_count);
  end if;

  update public.line_webhook_events
  set status = 'processing',
      delivery_status = 'not_attempted',
      last_error_code = null,
      attempt_count = attempt_count + 1,
      processing_started_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where event_id = p_event_id
    and (
      status = 'failed_retryable'
      or (
        status = 'processing'
        and delivery_status = 'not_attempted'
        and processing_started_at < clock_timestamp() - make_interval(secs => v_reclaim_seconds)
      )
    )
  returning * into v_row;

  if found then
    return jsonb_build_object('claimed', true, 'status', v_row.status, 'attempt_count', v_row.attempt_count);
  end if;

  select * into v_row from public.line_webhook_events where event_id = p_event_id;
  return jsonb_build_object('claimed', false, 'status', v_row.status, 'delivery_status', v_row.delivery_status);
end;
$$;

revoke all on function public.line_webhook_event_claim(text, text, integer) from public, anon, authenticated;
grant execute on function public.line_webhook_event_claim(text, text, integer) to service_role;

-- Associate both user and assistant history entries with the processing event IDs. This makes a
-- safe pre-send retry idempotent even if a prior attempt appended history before it crashed.
drop function if exists public.line_append_chat_history(text, jsonb, integer);
drop function if exists public.line_append_chat_history(text, jsonb, integer, text[]);
create function public.line_append_chat_history(
  p_user_id text,
  p_message jsonb,
  p_max_history integer default 40,
  p_event_ids text[] default '{}'
) returns public.line_chat_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.line_chat_sessions;
  v_message jsonb := case
    when coalesce(cardinality(p_event_ids), 0) = 0 then p_message
    else p_message || jsonb_build_object('webhook_event_ids', to_jsonb(p_event_ids))
  end;
begin
  insert into public.line_chat_sessions (user_id, history, last_interaction)
  values (p_user_id, jsonb_build_array(v_message), clock_timestamp())
  on conflict (user_id) do update set
    history = case
      when coalesce(cardinality(p_event_ids), 0) > 0 and exists (
        select 1
        from jsonb_array_elements(line_chat_sessions.history) h
        where h->>'role' = p_message->>'role'
          and exists (
            select 1
            from unnest(p_event_ids) as x(id)
            where coalesce(h->'webhook_event_ids', '[]'::jsonb) ? x.id
          )
      ) then line_chat_sessions.history
      else (
        select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
        from jsonb_array_elements(line_chat_sessions.history || jsonb_build_array(v_message))
             with ordinality as t(elem, ord)
        where ord > greatest(0, jsonb_array_length(line_chat_sessions.history) + 1 - p_max_history)
      )
    end,
    last_interaction = case
      when coalesce(cardinality(p_event_ids), 0) > 0 and exists (
        select 1
        from jsonb_array_elements(line_chat_sessions.history) h
        where h->>'role' = p_message->>'role'
          and exists (
            select 1
            from unnest(p_event_ids) as x(id)
            where coalesce(h->'webhook_event_ids', '[]'::jsonb) ? x.id
          )
      ) then line_chat_sessions.last_interaction
      else clock_timestamp()
    end
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.line_append_chat_history(text, jsonb, integer, text[]) from public, anon, authenticated;
grant execute on function public.line_append_chat_history(text, jsonb, integer, text[]) to service_role;

-- Carry webhookEventId through the existing image batch so one redelivery is not processed twice,
-- and so a batch completion/uncertain send can be reflected on every event in that batch.
alter table public.line_image_batches
  add column if not exists event_ids text[] not null default '{}';

drop function if exists public.line_image_batch_append(text, text, text, bigint, text);
drop function if exists public.line_image_batch_append(text, text, text, bigint, text, text);
create function public.line_image_batch_append(
  p_line_uid text,
  p_message_id text,
  p_reply_token text,
  p_event_timestamp bigint,
  p_provider_type text default null,
  p_webhook_event_id text default null
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
    'provider_type', p_provider_type,
    'webhook_event_id', p_webhook_event_id
  );
begin
  insert into public.line_image_batches (line_uid, items, event_ids, updated_at)
  values (
    p_line_uid,
    jsonb_build_array(v_item),
    case when p_webhook_event_id is null then '{}'::text[] else array[p_webhook_event_id] end,
    clock_timestamp()
  )
  on conflict (line_uid) do update set
    items = case
      when exists (
        select 1 from jsonb_array_elements(line_image_batches.items) e
        where e->>'message_id' = p_message_id
           or (p_webhook_event_id is not null and e->>'webhook_event_id' = p_webhook_event_id)
      ) then line_image_batches.items
      else line_image_batches.items || jsonb_build_array(v_item)
    end,
    event_ids = case
      when p_webhook_event_id is null or p_webhook_event_id = any(line_image_batches.event_ids)
        then line_image_batches.event_ids
      else array_append(line_image_batches.event_ids, p_webhook_event_id)
    end,
    updated_at = case
      when exists (
        select 1 from jsonb_array_elements(line_image_batches.items) e
        where e->>'message_id' = p_message_id
           or (p_webhook_event_id is not null and e->>'webhook_event_id' = p_webhook_event_id)
      ) then line_image_batches.updated_at
      else clock_timestamp()
    end
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.line_image_batch_append(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.line_image_batch_append(text, text, text, bigint, text, text) to service_role;

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

revoke all on function public.line_image_batch_claim(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.line_image_batch_claim(text, timestamptz, integer) to service_role;

select cron.schedule(
  'line-webhook-events-cleanup',
  '17 3 * * *',
  $$ delete from public.line_webhook_events where created_at < now() - interval '30 days'; $$
);
