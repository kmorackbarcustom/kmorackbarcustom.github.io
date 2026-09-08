-- Phase E1: owner authentication and atomic shop provisioning
-- The caller must be an authenticated Supabase Auth user. The function creates
-- the shop and its first owner membership in one transaction.

ALTER TABLE local_service.shops
    ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS business_category VARCHAR(255),
    ADD COLUMN IF NOT EXISTS requested_plan VARCHAR(50) NOT NULL DEFAULT 'free_trial'
        CHECK (requested_plan IN ('free_trial', 'basic_490', 'pro_990')),
    ADD COLUMN IF NOT EXISTS registration_idempotency_key UUID UNIQUE;

DROP POLICY IF EXISTS "Users view own shop memberships" ON local_service.shop_users;
CREATE POLICY "Users view own shop memberships"
    ON local_service.shop_users
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

GRANT SELECT ON TABLE local_service.shop_users TO authenticated;

CREATE OR REPLACE FUNCTION local_service.provision_owner_shop(
    p_shop_name TEXT,
    p_shop_slug TEXT,
    p_business_category TEXT,
    p_owner_name TEXT,
    p_owner_phone TEXT,
    p_promptpay_number TEXT,
    p_promptpay_name TEXT,
    p_requested_plan TEXT,
    p_idempotency_key UUID
)
RETURNS TABLE (
    shop_id UUID,
    shop_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_shop_id UUID;
    v_shop_slug TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_shop_name), '') IS NULL
       OR NULLIF(BTRIM(p_shop_slug), '') IS NULL
       OR NULLIF(BTRIM(p_business_category), '') IS NULL
       OR NULLIF(BTRIM(p_owner_name), '') IS NULL
       OR NULLIF(BTRIM(p_owner_phone), '') IS NULL
       OR NULLIF(BTRIM(p_promptpay_number), '') IS NULL
       OR NULLIF(BTRIM(p_promptpay_name), '') IS NULL THEN
        RAISE EXCEPTION 'All shop and owner fields are required' USING ERRCODE = '22023';
    END IF;

    IF p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
        RAISE EXCEPTION 'Shop slug must contain lowercase letters, numbers, and single hyphens only'
            USING ERRCODE = '22023';
    END IF;

    IF p_requested_plan NOT IN ('free_trial', 'basic_490', 'pro_990') THEN
        RAISE EXCEPTION 'Invalid requested plan' USING ERRCODE = '22023';
    END IF;

    SELECT s.id, s.slug
      INTO v_shop_id, v_shop_slug
      FROM local_service.shops AS s
      JOIN local_service.shop_users AS su ON su.shop_id = s.id
     WHERE su.user_id = v_user_id
       AND s.registration_idempotency_key = p_idempotency_key;

    IF v_shop_id IS NOT NULL THEN
        RETURN QUERY SELECT v_shop_id, v_shop_slug;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM local_service.shop_users
         WHERE user_id = v_user_id
           AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'This account already owns a shop' USING ERRCODE = '23505';
    END IF;

    INSERT INTO local_service.shops (
        name,
        slug,
        phone,
        promptpay_number,
        promptpay_name,
        line_oa_id,
        subscription_status,
        trial_ends_at,
        owner_name,
        business_category,
        requested_plan,
        registration_idempotency_key
    ) VALUES (
        BTRIM(p_shop_name),
        BTRIM(p_shop_slug),
        BTRIM(p_owner_phone),
        BTRIM(p_promptpay_number),
        BTRIM(p_promptpay_name),
        'central_booking_oa',
        'trial',
        NOW() + INTERVAL '14 days',
        BTRIM(p_owner_name),
        BTRIM(p_business_category),
        p_requested_plan,
        p_idempotency_key
    )
    RETURNING id, slug INTO v_shop_id, v_shop_slug;

    INSERT INTO local_service.shop_users (shop_id, user_id, role)
    VALUES (v_shop_id, v_user_id, 'owner');

    RETURN QUERY SELECT v_shop_id, v_shop_slug;
END;
$$;

REVOKE ALL ON FUNCTION local_service.provision_owner_shop(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION local_service.provision_owner_shop(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;
