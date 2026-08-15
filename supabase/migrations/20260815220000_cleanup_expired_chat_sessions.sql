-- Read-time TTL check (PostgresSessionStore.get) already stops stale context leaking into a new
-- chat, but an abandoned session's row just sits in the table forever until that customer happens
-- to message again. This cron job actually deletes expired rows so the table doesn't grow unbounded.
-- Reads session_ttl_hours from system_settings so it always matches whatever admin-shop-config.html
-- has set, instead of a second hardcoded number that could drift out of sync.
select cron.schedule(
  'line-chat-sessions-cleanup',
  '0 * * * *',
  $cron$
    delete from public.line_chat_sessions
    where last_interaction < now() - (
      coalesce((select value from public.system_settings where key = 'session_ttl_hours'), '6')::numeric || ' hours'
    )::interval;
  $cron$
);
