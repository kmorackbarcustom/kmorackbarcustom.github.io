-- Platform admin: real role gate + real tenant-shop management RPCs for
-- apps/booking-admin/src/app/platform-admin, replacing the previous
-- unauthenticated static-mock page. Scoped to data that actually exists
-- (shops + subscriptions); quota/usage/add-on/LINE-message metering is not
-- tracked anywhere yet and is intentionally not represented here.

CREATE TABLE IF NOT EXISTS local_service.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE local_service.platform_admins ENABLE ROW LEVEL SECURITY;
-- No direct table grants at all. Every read/write goes through the
-- SECURITY DEFINER functions below so membership can never be queried or
-- altered by a client, admin or not.
REVOKE ALL ON TABLE local_service.platform_admins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION local_service.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM local_service.platform_admins WHERE user_id = auth.uid()
       );
$$;

REVOKE ALL ON FUNCTION local_service.is_platform_admin() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.is_platform_admin() TO authenticated;

CREATE TYPE local_service.platform_admin_shop_row AS (
    shop_id UUID,
    name VARCHAR,
    slug VARCHAR,
    business_category VARCHAR,
    owner_name VARCHAR,
    phone VARCHAR,
    promptpay_number VARCHAR,
    requested_plan VARCHAR,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    subscription_plan TEXT,
    subscription_status TEXT,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
);

CREATE OR REPLACE FUNCTION local_service.platform_admin_list_shops()
RETURNS SETOF local_service.platform_admin_shop_row
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_platform_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.slug,
        s.business_category,
        s.owner_name,
        s.phone,
        s.promptpay_number,
        s.requested_plan,
        s.is_active,
        s.created_at,
        sub.plan,
        sub.status,
        sub.current_period_end,
        sub.cancel_at_period_end
    FROM local_service.shops AS s
    LEFT JOIN local_service.subscriptions AS sub ON sub.shop_id = s.id
    ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION local_service.platform_admin_list_shops() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.platform_admin_list_shops() TO authenticated;

CREATE OR REPLACE FUNCTION local_service.platform_admin_set_shop_active(
    p_shop_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_platform_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized';
    END IF;

    UPDATE local_service.shops
    SET is_active = p_is_active,
        updated_at = now()
    WHERE id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.platform_admin_set_shop_active(UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.platform_admin_set_shop_active(UUID, BOOLEAN) TO authenticated;

-- Extends whichever column the booking-acceptance gate actually reads
-- (COALESCE(subscriptions.current_period_end, shops.trial_ends_at), see
-- enforce_shop_booking_acceptance / shop_public_profile). Only meaningful
-- for a shop currently on `trialing`; a no-op otherwise.
CREATE OR REPLACE FUNCTION local_service.platform_admin_extend_trial(
    p_shop_id UUID,
    p_days INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_platform_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized';
    END IF;
    IF p_days IS NULL OR p_days = 0 THEN
        RETURN;
    END IF;

    UPDATE local_service.subscriptions
    SET current_period_end = COALESCE(
            current_period_end,
            (SELECT trial_ends_at FROM local_service.shops WHERE id = p_shop_id)
        ) + (p_days || ' days')::interval,
        updated_at = now()
    WHERE shop_id = p_shop_id
      AND status = 'trialing';

    UPDATE local_service.shops
    SET trial_ends_at = trial_ends_at + (p_days || ' days')::interval,
        updated_at = now()
    WHERE id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.platform_admin_extend_trial(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.platform_admin_extend_trial(UUID, INTEGER) TO authenticated;

-- Administrative plan-label correction only (e.g. fixing a support ticket).
-- Does not touch Stripe and is not the source of billing truth -- the
-- Stripe webhook (sync_subscription_state) remains the real plan/status
-- writer for anything a customer actually paid for.
CREATE OR REPLACE FUNCTION local_service.platform_admin_update_plan(
    p_shop_id UUID,
    p_plan TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_platform_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized';
    END IF;
    IF p_plan NOT IN ('free_trial', 'basic_490', 'pro_990') THEN
        RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
    END IF;

    UPDATE local_service.subscriptions
    SET plan = p_plan,
        updated_at = now()
    WHERE shop_id = p_shop_id;

    UPDATE local_service.shops
    SET requested_plan = p_plan,
        updated_at = now()
    WHERE id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.platform_admin_update_plan(UUID, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.platform_admin_update_plan(UUID, TEXT) TO authenticated;
