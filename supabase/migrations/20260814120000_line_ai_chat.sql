create table if not exists public.line_chat_sessions (
  user_id text primary key,
  state text not null default 'IDLE',
  context_data jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  last_interaction timestamptz not null default now()
);
alter table public.line_chat_sessions enable row level security;
-- service-role only (edge functions), same reasoning already applied to public.customers /
-- public.notifications_log elsewhere in this repo - no policies needed, zero-policy RLS
-- fully blocks anon/authenticated access without affecting service-role code paths.

insert into public.system_settings (key, value, description)
values
  ('line_ai_rollout', 'off', 'LINE AI chat rollout stage: off | owner_only | all'),
  ('line_ai_owner_uid', 'U0e47999ae5f498af12ed04c9c54001fa', 'LINE userId of the shop owner, for owner_only rollout gating')
on conflict (key) do nothing;
