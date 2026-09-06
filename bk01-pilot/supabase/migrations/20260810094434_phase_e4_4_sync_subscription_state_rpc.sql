-- Phase E4.4: Postgres RPC function for atomic subscription-state sync.
-- Called by the Stripe webhook handler (apps/booking-admin/src/app/api/webhooks/stripe/route.ts)
-- to write to local_service.subscriptions AND local_service.shops.subscription_status
-- in a single transaction, per STRIPE_SUBSCRIPTION_STATE_MACHINE.md section 3.4.
--
-- The function also implements the out-of-order timestamp guard (section 4.3.2 step 4):
-- if the incoming event's created timestamp is older than the row's current updated_at,
-- the state update is skipped (but the function returns successfully so the webhook
-- handler can ack 200 to Stripe).

CREATE OR REPLACE FUNCTION local_service.sync_subscription_state(
    p_event_type             TEXT,
    p_event_created          BIGINT,
    p_shop_id                UUID,
    p_stripe_customer_id     TEXT,
    p_stripe_subscription_id TEXT,
    p_plan                   TEXT DEFAULT NULL,
    p_status                 TEXT DEFAULT NULL,
    p_current_period_end     BIGINT DEFAULT NULL,
    p_cancel_at_period_end   BOOLEAN DEFAULT NULL
)
RETURNS TABLE(applied BOOLEAN, shop_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_target_shop_id    UUID;
    v_current_updated_at TIMESTAMPTZ;
    v_event_ts          TIMESTAMPTZ := to_timestamp(p_event_created);
    v_new_status        TEXT := p_status;
    v_legacy_status     TEXT;
BEGIN
    -- Resolve the target shop_id: use the explicit parameter for checkout events,
    -- otherwise look up the shop by stripe_subscription_id.
    IF p_shop_id IS NOT NULL THEN
        v_target_shop_id := p_shop_id;
    ELSE
        SELECT shop_id INTO v_target_shop_id
          FROM local_service.subscriptions
         WHERE stripe_subscription_id = p_stripe_subscription_id
         LIMIT 1;
    END IF;

    IF v_target_shop_id IS NULL THEN
        -- No matching subscription row; signal not-applied so the handler logs it.
        RETURN QUERY SELECT false, NULL::uuid;
        RETURN;
    END IF;

    -- Out-of-order guard: skip if the event is older than the current DB state.
    SELECT updated_at INTO v_current_updated_at
      FROM local_service.subscriptions
     WHERE shop_id = v_target_shop_id
     LIMIT 1;

    IF FOUND AND v_current_updated_at IS NOT NULL AND v_event_ts < v_current_updated_at THEN
        RETURN QUERY SELECT false, v_target_shop_id;
        RETURN;
    END IF;

    -- Map granular status to legacy shops.subscription_status per section 3.3.
    -- The mapping matrix is copied exactly from the design doc:
    --   trialing         -> 'trial'
    --   active           -> 'active'
    --   past_due         -> 'past_due'
    --   canceled         -> 'canceled'
    --   incomplete       -> 'inactive'
    --   incomplete_expired -> 'canceled'
    --   unpaid           -> 'canceled'
    v_new_status := COALESCE(p_status, '');
    CASE v_new_status
        WHEN 'trialing'          THEN v_legacy_status := 'trial';
        WHEN 'active'            THEN v_legacy_status := 'active';
        WHEN 'past_due'          THEN v_legacy_status := 'past_due';
        WHEN 'canceled'          THEN v_legacy_status := 'canceled';
        WHEN 'incomplete'        THEN v_legacy_status := 'inactive';
        WHEN 'incomplete_expired' THEN v_legacy_status := 'canceled';
        WHEN 'unpaid'            THEN v_legacy_status := 'canceled';
        ELSE v_legacy_status := NULL;
    END CASE;

    -- Apply the correct write per event type (section 2.2 specs).
    IF p_event_type = 'checkout.session.completed' THEN
        -- UPSERT: insert or update the full subscription row.
        INSERT INTO local_service.subscriptions (
            shop_id,
            stripe_customer_id,
            stripe_subscription_id,
            plan,
            status,
            current_period_end,
            cancel_at_period_end,
            updated_at
        ) VALUES (
            v_target_shop_id,
            p_stripe_customer_id,
            p_stripe_subscription_id,
            COALESCE(p_plan, 'free_trial'),
            COALESCE(p_status, 'trialing'),
            CASE WHEN p_current_period_end IS NOT NULL
                 THEN to_timestamp(p_current_period_end) ELSE NULL END,
            COALESCE(p_cancel_at_period_end, false),
            now()
        )
        ON CONFLICT (shop_id) DO UPDATE SET
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            updated_at = now();

    ELSIF p_event_type = 'customer.subscription.updated' THEN
        UPDATE local_service.subscriptions
           SET plan = COALESCE(p_plan, subscriptions.plan),
               status = COALESCE(p_status, subscriptions.status),
               current_period_end = CASE
                   WHEN p_current_period_end IS NOT NULL
                   THEN to_timestamp(p_current_period_end)
                   ELSE subscriptions.current_period_end
               END,
               cancel_at_period_end = COALESCE(
                   p_cancel_at_period_end, subscriptions.cancel_at_period_end),
               updated_at = now()
         WHERE stripe_subscription_id = p_stripe_subscription_id;

    ELSIF p_event_type = 'customer.subscription.deleted' THEN
        UPDATE local_service.subscriptions
           SET status = 'canceled',
               cancel_at_period_end = false,
               updated_at = now()
         WHERE stripe_subscription_id = p_stripe_subscription_id;
        v_legacy_status := 'canceled';

    ELSIF p_event_type = 'invoice.paid' THEN
        UPDATE local_service.subscriptions
           SET status = 'active',
               current_period_end = CASE
                   WHEN p_current_period_end IS NOT NULL
                   THEN to_timestamp(p_current_period_end)
                   ELSE subscriptions.current_period_end
               END,
               updated_at = now()
         WHERE stripe_subscription_id = p_stripe_subscription_id;
        v_legacy_status := 'active';

    ELSIF p_event_type = 'invoice.payment_failed' THEN
        UPDATE local_service.subscriptions
           SET status = 'past_due',
               updated_at = now()
         WHERE stripe_subscription_id = p_stripe_subscription_id;
        v_legacy_status := 'past_due';

    ELSE
        -- Unknown event type — don't touch the DB.
        RETURN QUERY SELECT false, v_target_shop_id;
        RETURN;
    END IF;

    -- Sync legacy column on shops (section 3.4 step 2).
    IF v_legacy_status IS NOT NULL THEN
        UPDATE local_service.shops
           SET subscription_status = v_legacy_status,
               updated_at = now()
         WHERE id = v_target_shop_id;
    END IF;

    RETURN QUERY SELECT true, v_target_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION local_service.sync_subscription_state(
    TEXT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION local_service.sync_subscription_state(
    TEXT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN
) TO service_role;