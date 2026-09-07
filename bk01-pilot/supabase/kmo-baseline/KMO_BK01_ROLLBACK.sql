-- KMO BK01 dark-deploy containment rollback
-- Non-destructive: preserves BK01/bridge data and never mutates existing KMO public.*.
-- Use only after verifying target project ref xfhpwxjywqgqefbncumm.

BEGIN;

-- Fail closed for browser clients while retaining service-role access for evidence/recovery.
REVOKE USAGE ON SCHEMA local_service FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA local_service FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA local_service FROM anon, authenticated;

-- Remove merchant browser access to deposit-slip objects; bucket/data are preserved.
DROP POLICY IF EXISTS "KMO BK01 merchant reads deposit slips" ON storage.objects;

-- Record rollback only if the isolated control row has already been provisioned.
UPDATE kmo_bridge.cutover_state
SET phase='rollback', rollback_available=true, updated_at=now()
WHERE id=1;

COMMIT;

-- Deliberately does NOT drop local_service/kmo_booking/kmo_bridge schemas,
-- delete storage objects, delete the deposit-slips bucket, or change legacy KMO routes.