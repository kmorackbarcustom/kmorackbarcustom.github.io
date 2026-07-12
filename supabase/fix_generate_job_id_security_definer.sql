-- Fix (2026-07-12): generate_job_id() needs to read existing bookings to
-- compute the next sequence number, but runs as the calling role (anon,
-- via the public booking form) with no SELECT visibility under RLS on
-- bookings. Mark it SECURITY DEFINER with a locked search_path so it can
-- read reliably regardless of caller, without granting anon direct SELECT
-- on the table (keeps the RLS PII protection intact).
create or replace function public.generate_job_id(p_platform text)
 returns text
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
DECLARE
  v_prefix TEXT;
  v_year_month TEXT;
  v_max_seq INTEGER;
  v_new_seq TEXT;
BEGIN
  CASE LOWER(TRIM(p_platform))
    WHEN 'facebook' THEN v_prefix := 'KFB';
    WHEN 'line' THEN v_prefix := 'KLI';
    WHEN 'tiktok' THEN v_prefix := 'KTK';
    WHEN 'instagram' THEN v_prefix := 'KIG';
    WHEN 'หน้าร้าน' THEN v_prefix := 'KWN';
    WHEN 'เพื่อนแนะนำ' THEN v_prefix := 'KRF';
    ELSE v_prefix := 'KOT';
  END CASE;

  v_year_month := TO_CHAR(NOW(), 'YYMM');

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(job_id, '-', 3) AS INTEGER)
  ), 0) INTO v_max_seq
  FROM bookings
  WHERE job_id LIKE v_prefix || '-' || v_year_month || '-%';

  v_new_seq := LPAD((v_max_seq + 1)::TEXT, 4, '0');

  RETURN v_prefix || '-' || v_year_month || '-' || v_new_seq;
END;
$function$;
