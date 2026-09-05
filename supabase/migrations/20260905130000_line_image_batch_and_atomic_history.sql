-- Fixes a real production race: StateManager.appendHistory() (vendored LINE OA module) does
-- read-session -> mutate-in-JS -> write-session with no locking. When multiple images from the
-- same customer arrive close together, concurrent webhook invocations clobber each other's
-- history writes (duplicate/near-identical AI replies, lost history entries). This migration is
-- purely additive: a new atomic append RPC for line_chat_sessions.history, and a new table +
-- two RPCs that let the image webhook branch coalesce a burst of images into one AI turn
-- ("supersede and bail": each image appends itself then waits briefly; only the last image in
-- the burst actually claims and processes the whole batch, everyone else bails for free).

-- Atomic history append: whole append+trim happens in one statement, so concurrent callers for
-- the same user_id serialize via Postgres's own row lock on the UPDATE - no JS-side
-- read-modify-write gap exists at all.
create or replace function public.line_append_chat_history(
  p_user_id text,
  p_message jsonb,
  p_max_history integer default 40
) returns public.line_chat_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.line_chat_sessions;
begin
  insert into public.line_chat_sessions (user_id, history, last_interaction)
  values (p_user_id, jsonb_build_array(p_message), now())
  on conflict (user_id) do update set
    history = (
      select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      from jsonb_array_elements(line_chat_sessions.history || jsonb_build_array(p_message))
           with ordinality as t(elem, ord)
      where ord > greatest(0, jsonb_array_length(line_chat_sessions.history) + 1 - p_max_history)
    ),
    last_interaction = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Pending-image coordination table for the "supersede and bail" burst-batching pattern.
-- created_at freezes at the first item's insert (used for the max-wait force-claim guard);
-- updated_at bumps on every non-duplicate append (used to detect "someone appended after me").
-- created_at/updated_at use clock_timestamp() (advances on every call, even within one
-- transaction), not now() (frozen at transaction start) - line_image_batch_append can otherwise
-- return an identical updated_at for two appends that happen to run inside the same Postgres
-- transaction, which would break the claim RPC's "is anything newer than me" comparison. In
-- production each RPC call is its own PostgREST transaction so this is defense in depth, not a
-- fix for an observed production failure - but it's free and it closes the gap outright.
create table if not exists public.line_image_batches (
  line_uid text primary key,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.line_image_batches enable row level security;
-- No policies: service-role only, same posture as line_chat_sessions (no client ever reads this
-- table directly - only line-webhook via the service-role client and the two RPCs below).

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

-- Compare-and-delete: only the caller whose own append is still the most recent one (updated_at
-- unchanged since it appended, i.e. nobody added a newer image while we were waiting) wins the
-- DELETE and gets every queued item to process as one batch. Anyone else gets zero rows back
-- (NULL) and should bail without doing any vision/LLM work. p_max_wait_seconds force-claims a
-- stale batch so a long straggling burst can't defer processing forever.
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

-- Hygiene sweep for rows orphaned by a crash between append and claim (mirrors the existing
-- cleanup_expired_chat_sessions cron job). This is not a correctness requirement - it's the same
-- best-effort cleanup posture the single-image code path already had (a crash mid-processing
-- already dropped that reply with no recovery before this migration).
select cron.schedule(
  'line-image-batches-cleanup',
  '*/5 * * * *',
  $$ delete from public.line_image_batches where created_at < now() - interval '2 minutes'; $$
);
