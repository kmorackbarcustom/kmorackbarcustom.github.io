-- Phase E3.3: owner-only shop settings + public shop profile column limiting.
--
-- Prior to this migration, `local_service.shops` had a blanket GRANT ALL to
-- anon/authenticated (same gap already closed on bookings/services/staff/
-- staff_schedules/shop_holidays in E2/E3.1/E3.2), and the only RLS SELECT
-- policy for anon ("Public shops viewable by everyone") did not restrict
-- which COLUMNS were exposed. Confirmed live via a real anon REST call that
-- `select=*` returned subscription_status, trial_ends_at, owner_name,
-- business_category, and requested_plan to any unauthenticated caller who
-- knows a shop's slug (which is a public URL by design).

-- 1. Lock down the base table: authenticated dashboard reads still work via
--    the existing "Members view own shop" RLS policy (added in E1), which
--    already scopes to the caller's own shop and returns every column that
--    policy allows. Anon loses table-level access entirely and must go
--    through the column-limited view below instead.
REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.shops FROM anon, authenticated;
REVOKE SELECT ON TABLE local_service.shops FROM anon;

-- 2. Public-safe read surface: only the columns the consumer booking flow
--    actually uses. security_invoker=true means this view runs with the
--    querying role's own permissions (and therefore its own RLS), not the
--    view owner's -- so it can never expose more than the underlying table
--    already allows for that role, even if a future table policy changes.
CREATE OR REPLACE VIEW local_service.shop_public_profile
    WITH (security_invoker = true) AS
SELECT
    id,
    name,
    slug,
    phone,
    address,
    line_oa_id,
    promptpay_number,
    promptpay_name,
    require_deposit,
    default_deposit_amount
FROM local_service.shops
WHERE is_active = true;

GRANT SELECT ON local_service.shop_public_profile TO anon, authenticated;

-- 3. Owner-only settings RPC. Per PRODUCT_RULES_V1 section 7 ("ตั้งค่าร้าน /
--    PromptPay"), only the owner role may change these fields -- admin and
--    staff are both explicitly excluded, unlike services/staff management
--    which admins can also do.
CREATE OR REPLACE FUNCTION local_service.update_shop_settings(
    p_shop_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_address TEXT,
    p_promptpay_number TEXT,
    p_promptpay_name TEXT,
    p_line_oa_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_shop_owner(p_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Shop name is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_phone), '') IS NULL THEN
        RAISE EXCEPTION 'Shop phone is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_promptpay_number), '') IS NULL THEN
        RAISE EXCEPTION 'PromptPay number is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_promptpay_name), '') IS NULL THEN
        RAISE EXCEPTION 'PromptPay account name is required' USING ERRCODE = '22023';
    END IF;

    UPDATE local_service.shops
       SET name = BTRIM(p_name),
           phone = BTRIM(p_phone),
           address = NULLIF(BTRIM(p_address), ''),
           promptpay_number = BTRIM(p_promptpay_number),
           promptpay_name = BTRIM(p_promptpay_name),
           line_oa_id = NULLIF(BTRIM(p_line_oa_id), ''),
           updated_at = NOW()
     WHERE id = p_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop not found';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION local_service.update_shop_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.update_shop_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
