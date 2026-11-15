alter table public.customers
  add column if not exists human_takeover boolean not null default false,
  add column if not exists line_delivery_started_at timestamptz,
  add column if not exists line_delivery_event_id text;

create table if not exists public.line_inbox_messages (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  role text not null check (role in ('customer', 'ai', 'staff')),
  message_type text not null check (message_type in ('text', 'image')),
  content text,
  line_message_id text,
  event_id text,
  request_id uuid,
  delivery_status text not null default 'received'
    check (delivery_status in ('received', 'pending', 'accepted', 'rejected', 'uncertain', 'suppressed')),
  created_at timestamptz not null default clock_timestamp(),
  check (
    (message_type = 'text' and content is not null and (role <> 'customer' or line_message_id is not null))
    or (role = 'customer' and message_type = 'image' and content is null and line_message_id is not null)
  )
);

alter table public.line_inbox_messages enable row level security;
revoke all on table public.line_inbox_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.line_inbox_messages to service_role;
grant usage, select on sequence public.line_inbox_messages_id_seq to service_role;

create table if not exists public.line_staff_auth_attempts (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  failed_attempts smallint not null default 0
    check (failed_attempts between 0 and 10),
  window_started_at timestamptz not null default clock_timestamp(),
  blocked_until timestamptz
);

alter table public.line_staff_auth_attempts enable row level security;
revoke all on table public.line_staff_auth_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.line_staff_auth_attempts to service_role;

create or replace function public.line_staff_auth_attempt(
  p_ip_hash text,
  p_success boolean
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.line_staff_auth_attempts;
  v_now timestamptz := clock_timestamp();
  v_failures smallint;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or p_success is null then
    return 'invalid_attempt';
  end if;

  insert into public.line_staff_auth_attempts(ip_hash)
  values (p_ip_hash)
  on conflict (ip_hash) do nothing;

  select * into v_attempt
  from public.line_staff_auth_attempts
  where ip_hash = p_ip_hash
  for update;

  if v_attempt.blocked_until > v_now then return 'blocked'; end if;
  if p_success then
    delete from public.line_staff_auth_attempts where ip_hash = p_ip_hash;
    return 'allowed';
  end if;

  if v_attempt.window_started_at <= v_now - interval '15 minutes' then
    update public.line_staff_auth_attempts
    set failed_attempts = 1,
        window_started_at = v_now,
        blocked_until = null
    where ip_hash = p_ip_hash;
    return 'denied';
  end if;

  v_failures := v_attempt.failed_attempts + 1;
  update public.line_staff_auth_attempts
  set failed_attempts = v_failures,
      blocked_until = case when v_failures >= 10 then v_now + interval '15 minutes' else null end
  where ip_hash = p_ip_hash;
  return case when v_failures >= 10 then 'blocked' else 'denied' end;
end;
$$;

create unique index if not exists line_inbox_messages_event_role_uidx
  on public.line_inbox_messages (event_id, role);
create unique index if not exists line_inbox_messages_line_id_uidx
  on public.line_inbox_messages (line_message_id);
create unique index if not exists line_inbox_messages_request_uidx
  on public.line_inbox_messages (request_id);
create index if not exists line_inbox_messages_customer_created_idx
  on public.line_inbox_messages (customer_id, created_at desc, id desc);
create index if not exists line_inbox_messages_pending_created_idx
  on public.line_inbox_messages (created_at)
  where delivery_status = 'pending';

create or replace function public.line_inbox_list(
  p_search text default null,
  p_status text default 'all',
  p_offset integer default 0,
  p_limit integer default 51
) returns table (
  id uuid,
  name text,
  line_display_name text,
  phone text,
  paused_until timestamptz,
  human_takeover boolean,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('all', 'ai', 'human') then
    raise exception 'invalid inbox status';
  end if;
  if p_offset < 0 or p_offset > 100000 or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid inbox pagination';
  end if;

  return query
  select
    c.id,
    c.name,
    c.line_display_name,
    c.phone,
    c.paused_until,
    c.human_takeover,
    greatest(messages.last_at, session.last_interaction, audit.last_at) as last_activity_at
  from public.customers c
  left join public.line_chat_sessions session on session.user_id = c.line_uid
  left join lateral (
    select max(m.created_at) as last_at
    from public.line_inbox_messages m
    where m.customer_id = c.id
  ) messages on true
  left join lateral (
    select max(a.timestamp) as last_at
    from public.audit_logs a
    where a.entity_type = 'customer'
      and a.entity_id = c.id::text
      and a.action in ('customer.reply_sent', 'customer.ai_resumed', 'customer.human_takeover')
  ) audit on true
  where c.line_uid is not null
    and c.line_uid <> ''
    and (
      coalesce(p_search, '') = ''
      or coalesce(c.name, '') ilike '%' || p_search || '%'
      or coalesce(c.line_display_name, '') ilike '%' || p_search || '%'
      or coalesce(c.phone, '') ilike '%' || p_search || '%'
    )
    and (p_status = 'all' or (p_status = 'human' and c.human_takeover) or (p_status = 'ai' and not c.human_takeover))
  order by last_activity_at desc nulls last, c.id
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.line_inbox_list(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.line_inbox_list(text, text, integer, integer) to service_role;

create or replace function public.line_delivery_claim(
  p_customer_id uuid,
  p_event_id text,
  p_mode text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers;
  v_claim_token uuid := gen_random_uuid();
begin
  if p_event_id is null or length(p_event_id) = 0 or length(p_event_id) > 128 then
    return 'invalid_event';
  end if;
  if p_mode not in ('ai', 'human') then
    return 'invalid_mode';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found then return 'not_found'; end if;

  if p_mode = 'ai' then
    if v_customer.human_takeover then return 'human_takeover'; end if;
    if v_customer.paused_until > clock_timestamp() then return 'timed_pause'; end if;
  elsif not v_customer.human_takeover then
    return 'ai_mode';
  end if;

  if v_customer.line_delivery_started_at > clock_timestamp() - interval '30 seconds' then
    return 'busy';
  end if;

  update public.customers
  set line_delivery_started_at = clock_timestamp(),
      line_delivery_event_id = v_claim_token::text
  where id = p_customer_id;
  return 'claimed:' || v_claim_token::text;
end;
$$;

create or replace function public.line_delivery_release(
  p_customer_id uuid,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.customers
  set line_delivery_started_at = null,
      line_delivery_event_id = null
  where id = p_customer_id
    and line_delivery_event_id = p_event_id;
  return found;
end;
$$;

create or replace function public.line_delivery_renew(
  p_customer_id uuid,
  p_claim_token text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.customers
  set line_delivery_started_at = clock_timestamp()
  where id = p_customer_id
    and line_delivery_event_id = p_claim_token;
  return found;
end;
$$;

create or replace function public.line_customer_set_human_mode(
  p_customer_id uuid,
  p_human_takeover boolean
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers;
begin
  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found then return 'not_found'; end if;
  if v_customer.human_takeover = p_human_takeover then return 'unchanged'; end if;
  if v_customer.line_delivery_started_at > clock_timestamp() - interval '30 seconds' then
    return 'active_delivery';
  end if;

  update public.customers
  set human_takeover = p_human_takeover,
      line_delivery_started_at = null,
      line_delivery_event_id = null
  where id = p_customer_id;

  insert into public.audit_logs (
    id,
    actor_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    before,
    after,
    metadata,
    timestamp
  ) values (
    gen_random_uuid(),
    null,
    'staff',
    case when p_human_takeover then 'customer.human_takeover' else 'customer.ai_resumed' end,
    'customer',
    p_customer_id::text,
    jsonb_build_object('humanTakeover', v_customer.human_takeover),
    jsonb_build_object('humanTakeover', p_human_takeover),
    jsonb_build_object('channel', 'staff-reply'),
    clock_timestamp()
  );

  return 'updated';
end;
$$;

revoke all on function public.line_delivery_claim(uuid, text, text) from public, anon, authenticated;
revoke all on function public.line_delivery_release(uuid, text) from public, anon, authenticated;
revoke all on function public.line_delivery_renew(uuid, text) from public, anon, authenticated;
revoke all on function public.line_customer_set_human_mode(uuid, boolean) from public, anon, authenticated;
revoke all on function public.line_staff_auth_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.line_delivery_claim(uuid, text, text) to service_role;
grant execute on function public.line_delivery_release(uuid, text) to service_role;
grant execute on function public.line_delivery_renew(uuid, text) to service_role;
grant execute on function public.line_customer_set_human_mode(uuid, boolean) to service_role;
grant execute on function public.line_staff_auth_attempt(text, boolean) to service_role;

select cron.schedule(
  'line-inbox-pending-reconciliation',
  '*/5 * * * *',
  $$
    update public.line_inbox_messages
    set delivery_status = 'uncertain'
    where delivery_status = 'pending'
      and created_at < now() - interval '5 minutes';
  $$
);

select cron.schedule(
  'line-inbox-messages-cleanup',
  '17 3 * * *',
  $$ delete from public.line_inbox_messages where created_at < now() - interval '90 days'; $$
);

select cron.schedule(
  'line-staff-auth-attempts-cleanup',
  '47 * * * *',
  $$ delete from public.line_staff_auth_attempts
     where window_started_at < now() - interval '1 day'
       and (blocked_until is null or blocked_until < now()); $$
);
