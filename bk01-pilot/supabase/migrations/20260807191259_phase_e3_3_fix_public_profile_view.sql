-- Phase E3.3 fix: shop_public_profile was created WITH (security_invoker =
-- true), which meant Postgres also checked the QUERYING role's own
-- privileges on the underlying `shops` table -- so revoking anon's table-
-- level SELECT in the prior migration broke the view for anon too, not just
-- direct table access. Caught via a real anon REST call against the view
-- (401 permission denied on `shops`, not just the intended direct-table
-- test) before this was reported as verified.
--
-- The view has a fixed column list and a fixed WHERE is_active = true with
-- no caller-supplied input, so there is no bypass risk in letting it run
-- with the defining role's privileges (the default, security_invoker =
-- false) instead. This is the standard pattern for exposing a restricted
-- column subset of a locked-down table.
CREATE OR REPLACE VIEW local_service.shop_public_profile AS
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
