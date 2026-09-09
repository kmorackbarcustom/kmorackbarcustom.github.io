BEGIN;

CREATE OR REPLACE FUNCTION local_service.update_shop_profile(
  p_shop_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_address TEXT
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

  UPDATE local_service.shops
     SET name = BTRIM(p_name),
         phone = BTRIM(p_phone),
         address = NULLIF(BTRIM(p_address), ''),
         updated_at = NOW()
   WHERE id = p_shop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION local_service.update_shop_profile(UUID,TEXT,TEXT,TEXT)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION local_service.update_shop_profile(UUID,TEXT,TEXT,TEXT)
TO authenticated;

COMMIT;
