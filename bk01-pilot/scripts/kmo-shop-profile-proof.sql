BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT su.user_id::text
   FROM local_service.shop_users su
   JOIN local_service.shops s ON s.id=su.shop_id
   WHERE s.slug='kmo-rackbarcustom' AND su.role='owner'
   LIMIT 1), true
);
SELECT local_service.update_shop_profile(
  s.id, s.name, s.phone, COALESCE(s.address,'')
) FROM local_service.shops s WHERE s.slug='kmo-rackbarcustom';
ROLLBACK;
SELECT 'OWNER_PROFILE_PASS' AS owner_verdict;

DO $$
DECLARE v_shop_id uuid;
BEGIN
  SELECT id INTO v_shop_id FROM local_service.shops WHERE slug='kmo-rackbarcustom';
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
    PERFORM local_service.update_shop_profile(v_shop_id,'Denied','0000000000','Denied');
    RAISE EXCEPTION 'OUTSIDER_WAS_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
SELECT 'OUTSIDER_PROFILE_DENY_PASS' AS outsider_verdict;
