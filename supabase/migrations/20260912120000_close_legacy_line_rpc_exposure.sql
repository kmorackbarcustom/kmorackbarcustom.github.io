-- KMO-CONTROL-ARCH-REMEDIATION-2026-09-12
-- Close legacy LINE privileged RPC exposure (C0 security remediation)
--
-- Context: public.get_line_token() and public.send_line(text, text) were created via SQL Editor
-- (not via migration files). Both are SECURITY DEFINER and were callable by PUBLIC/anon/authenticated.
-- get_line_token() returns decrypted LINE channel access token from vault.
-- send_line() contains a hard-coded privileged JWT Bearer credential in its function body.
--
-- No active code dependency exists: zero triggers, zero views, zero other functions reference them.
-- The production line-webhook Edge Function uses its own service-role client and _shared/line.ts
-- to call the LINE Messaging API directly — it does NOT use these DB RPCs.
--
-- This migration:
--   1. REVOKE EXECUTE from PUBLIC, anon, authenticated on both legacy RPCs.
--   2. Replaces send_line() body to remove the hard-coded credential, replacing it with
--      a vault-based token lookup (same pattern as get_line_token).
--   3. Grants EXECUTE only to service_role and postgres (privileged server-side only).
--   4. Does NOT drop the functions — preserves backward compatibility for any server-side
--      caller that may use them with service_role, while closing public exposure.

-- 1. Revoke public exposure
REVOKE EXECUTE ON FUNCTION public.get_line_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_line(text, text) FROM PUBLIC, anon, authenticated;

-- 2. Replace send_line body — remove hard-coded credential, use vault-based token
--    The function now reads the LINE channel access token from vault.decrypted_secrets
--    (same pattern as get_line_token) instead of embedding a hard-coded JWT.
CREATE OR REPLACE FUNCTION public.send_line(target_id text, message_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_token text;
  v_result json;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'line_channel_access_token'
  LIMIT 1;

  IF v_token IS NULL THEN
    RETURN json_build_object('error', 'LINE channel access token not found in vault');
  END IF;

  SELECT content::json INTO v_result
  FROM http((
    'POST'::http_method,
    'https://api.line.me/v2/bot/message/push',
    ARRAY[
      ROW('Content-Type', 'application/json')::http_header,
      ROW('Authorization', 'Bearer ' || v_token)::http_header
    ],
    'application/json',
    json_build_object('to', target_id, 'messages', json_build_array(json_build_object('type', 'text', 'text', message_text)))::text
  ));
  RETURN v_result;
END;
$function$;

-- 3. Grant only to privileged roles
GRANT EXECUTE ON FUNCTION public.get_line_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_line(text, text) TO service_role;

-- Note: postgres always has implicit access; no explicit grant needed.