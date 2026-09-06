DROP FUNCTION IF EXISTS local_service.sync_subscription_state(
    TEXT, BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN
);

CREATE FUNCTION local_service.sync_subscription_state(
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
RETURNS TABLE(applied BOOLEAN, matched_shop_id UUID)
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
    IF p_shop_id IS NOT NULL THEN
        v_target_shop_id := p_shop_id;
    ELSE
        SELECT subscriptions.shop_id INTO v_target_shop_id
          FROM local_service.subscriptions
         WHERE subscriptions.stripe_subscription_id = p_stripe_subscription_id
         LIMIT 1;
    END IF;

    IF v_target_shop_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::uuid;
        RETURN;
    END IF;

    SELECT subscriptions.updated_at INTO v_current_updated_at
      FROM local_service.subscriptions
     WHERE subscriptions.shop_id = v_target_shop_id
     LIMIT 1;

    IF FOUND AND v_current_updated_at IS NOT NULL AND v_event_ts < v_current_updated_at THEN
        RETURN QUERY SELECT false, v_target_shop_id;
        RETURN;
    END IF;

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

    IF p_event_type = 'checkout.session.completed' THEN
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
        RETURN QUERY SELECT false, v_target_shop_id;
        RETURN;
    END IF;

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