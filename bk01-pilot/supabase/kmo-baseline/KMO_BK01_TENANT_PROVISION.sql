-- KMO BK01 Gate 5 tenant provisioning
-- Idempotent, KMO-only, no Auth user or PromptPay secret/identity.
BEGIN;

DO $kmo$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM local_service.shops
  WHERE slug = 'kmo-rackbarcustom';

  IF v_id IS NULL THEN
    INSERT INTO local_service.shops(
      name, slug, require_deposit, default_deposit_amount,
      subscription_status, trial_ends_at, is_active, requested_plan
    ) VALUES (
      'KMO RACKBARCUSTOM', 'kmo-rackbarcustom', true, 500.00,
      'active', NULL, true, 'free_trial'
    )
    RETURNING id INTO v_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM local_service.shops
      WHERE id = v_id
        AND name = 'KMO RACKBARCUSTOM'
        AND require_deposit = true
        AND default_deposit_amount = 500.00
    ) THEN
      RAISE EXCEPTION 'Existing KMO tenant does not match locked provisioning contract';
    END IF;
  END IF;

  INSERT INTO local_service.subscriptions(
    shop_id, plan, status, current_period_end, cancel_at_period_end
  ) VALUES (
    v_id, 'free_trial', 'active', NULL, false
  )
  ON CONFLICT(shop_id) DO UPDATE
    SET plan = 'free_trial',
        status = 'active',
        current_period_end = NULL,
        cancel_at_period_end = false,
        updated_at = now();

  INSERT INTO kmo_bridge.cutover_state(id, phase, rollback_available, metadata)
  VALUES(
    1,
    'dark_deploy',
    true,
    jsonb_build_object(
      'tenant_slug', 'kmo-rackbarcustom',
      'baseline_sha256', 'a79867b65d91a3e7958a6d96b0d002f031f4c1c20cb5bff96683014689da60ea',
      'postgrest_exposed', true
    )
  )
  ON CONFLICT(id) DO UPDATE
    SET phase = 'dark_deploy',
        rollback_available = true,
        metadata = EXCLUDED.metadata,
        updated_at = now();
END $kmo$;

COMMIT;
