-- Phase E3.1: role-aware service and staff management.

ALTER TABLE local_service.services
    ADD COLUMN IF NOT EXISTS creation_idempotency_key UUID;

ALTER TABLE local_service.staff
    ADD COLUMN IF NOT EXISTS creation_idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS services_shop_creation_idempotency_key
    ON local_service.services (shop_id, creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_shop_creation_idempotency_key
    ON local_service.staff (shop_id, creation_idempotency_key)
    WHERE creation_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION local_service.has_shop_role(
    target_shop_id UUID,
    allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM local_service.shop_users
             WHERE shop_id = target_shop_id
               AND user_id = auth.uid()
               AND role = ANY(allowed_roles)
       );
$$;

CREATE OR REPLACE FUNCTION local_service.is_shop_owner(target_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT local_service.has_shop_role(target_shop_id, ARRAY['owner']::TEXT[]);
$$;

REVOKE ALL ON FUNCTION local_service.has_shop_role(UUID, TEXT[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.has_shop_role(UUID, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION local_service.is_shop_owner(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.is_shop_owner(UUID) TO authenticated;

-- Keep public and tenant-scoped reads, but force authenticated writes through RPCs.
GRANT SELECT ON TABLE local_service.services, local_service.staff TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.services, local_service.staff FROM authenticated;

CREATE OR REPLACE FUNCTION local_service.create_service(
    p_shop_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_duration_minutes INTEGER,
    p_price NUMERIC,
    p_deposit_amount NUMERIC,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_service_id UUID;
BEGIN
    v_shop_id := p_shop_id;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Service name is required' USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes % 15 <> 0 THEN
        RAISE EXCEPTION 'Duration must be a positive multiple of 15 minutes' USING ERRCODE = '22023';
    END IF;

    IF p_price IS NULL OR p_price < 0
       OR p_deposit_amount IS NULL OR p_deposit_amount < 0
       OR p_deposit_amount > p_price THEN
        RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE = '22023';
    END IF;

    SELECT id
      INTO v_service_id
      FROM local_service.services
     WHERE shop_id = v_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_service_id IS NOT NULL THEN
        RETURN v_service_id;
    END IF;

    INSERT INTO local_service.services (
        shop_id, name, description, duration_minutes, price,
        deposit_amount, is_active, creation_idempotency_key
    ) VALUES (
        v_shop_id, BTRIM(p_name), NULLIF(BTRIM(p_description), ''),
        p_duration_minutes, p_price, p_deposit_amount, true, p_idempotency_key
    )
    RETURNING id INTO v_service_id;

    RETURN v_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.update_service(
    p_service_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_duration_minutes INTEGER,
    p_price NUMERIC,
    p_deposit_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_service local_service.services%ROWTYPE;
BEGIN
    SELECT * INTO v_service
      FROM local_service.services
     WHERE id = p_service_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found';
    END IF;

    IF NOT local_service.has_shop_role(v_service.shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Service name is required' USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes % 15 <> 0 THEN
        RAISE EXCEPTION 'Duration must be a positive multiple of 15 minutes' USING ERRCODE = '22023';
    END IF;

    IF p_price IS NULL OR p_price < 0
       OR p_deposit_amount IS NULL OR p_deposit_amount < 0
       OR p_deposit_amount > p_price THEN
        RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE = '22023';
    END IF;

    UPDATE local_service.services
       SET name = BTRIM(p_name),
           description = NULLIF(BTRIM(p_description), ''),
           duration_minutes = p_duration_minutes,
           price = p_price,
           deposit_amount = p_deposit_amount
     WHERE id = p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.set_service_active(
    p_service_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id
      FROM local_service.services
     WHERE id = p_service_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    UPDATE local_service.services
       SET is_active = p_is_active
     WHERE id = p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.create_staff(
    p_shop_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_staff_id UUID;
BEGIN
    v_shop_id := p_shop_id;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Staff name is required' USING ERRCODE = '22023';
    END IF;

    SELECT id
      INTO v_staff_id
      FROM local_service.staff
     WHERE shop_id = v_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_staff_id IS NOT NULL THEN
        RETURN v_staff_id;
    END IF;

    INSERT INTO local_service.staff (
        shop_id, name, phone, is_active, creation_idempotency_key
    ) VALUES (
        v_shop_id, BTRIM(p_name), NULLIF(BTRIM(p_phone), ''), true, p_idempotency_key
    )
    RETURNING id INTO v_staff_id;

    RETURN v_staff_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.set_staff_active(
    p_staff_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id
      FROM local_service.staff
     WHERE id = p_staff_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    UPDATE local_service.staff
       SET is_active = p_is_active
     WHERE id = p_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.create_service(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.create_service(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, UUID) TO authenticated;
REVOKE ALL ON FUNCTION local_service.update_service(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.update_service(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION local_service.set_service_active(UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.set_service_active(UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION local_service.create_staff(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.create_staff(UUID, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION local_service.set_staff_active(UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.set_staff_active(UUID, BOOLEAN) TO authenticated;
