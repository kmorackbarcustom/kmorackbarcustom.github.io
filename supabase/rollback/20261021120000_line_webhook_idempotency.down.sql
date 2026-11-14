-- ROLLBACK NOTES (not auto-applied: lives outside supabase/migrations).
-- The migration is backward compatible with function v48 (746c1773): new RPC args have defaults and
-- line_image_batch_claim keeps its original array result. So the normal rollback is ONLY:
--   redeploy the previous function source (git checkout 746c1773 -- supabase/functions; deploy line-webhook).
-- Run the SQL below only if the DB objects themselves must go (after the function is rolled back).
select cron.unschedule('line-webhook-events-cleanup');
drop function if exists public.line_webhook_event_claim(text, text, integer);
drop table if exists public.line_webhook_events;
-- Left in place on purpose (v48-compatible): line_append_chat_history(...,p_event_ids),
-- line_image_batch_append(...,p_webhook_event_id), line_image_batches.event_ids.
