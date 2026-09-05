-- get_advisors flagged line_append_chat_history/line_image_batch_append/line_image_batch_claim
-- as SECURITY DEFINER functions callable by anon/authenticated (Postgres's default PUBLIC EXECUTE
-- grant on new functions). Since they're SECURITY DEFINER, an anonymous caller with only the
-- public anon key could otherwise call them directly via PostgREST RPC to inject fake chat
-- history or spam image batches for any line_uid. Only line-webhook's service-role client should
-- ever call these - revoke the default public grant and restrict to service_role explicitly.
revoke all on function public.line_append_chat_history(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.line_image_batch_append(text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.line_image_batch_claim(text, timestamptz, integer) from public, anon, authenticated;

grant execute on function public.line_append_chat_history(text, jsonb, integer) to service_role;
grant execute on function public.line_image_batch_append(text, text, text, bigint, text) to service_role;
grant execute on function public.line_image_batch_claim(text, timestamptz, integer) to service_role;
