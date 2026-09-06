-- Phase Launch-1: truthful subscription state and booking-acceptance gate.
--
-- Scope deliberately excludes quota and add-on accounting.  The
-- local_service.subscriptions table is the billing-state source of truth;
-- shops.subscription_status remains the compatibility column maintained by
-- the Stripe webhook sync RPC from Phase E4.4.

-- Existing shops created before E4.1 have no subscription row.  Seed only
-- those missing rows and never overwrite a Stripe-owned row.
INSERT INTO local_service.subscriptions (
    shop_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end
)
SELECT
    s.id,
    CASE
        WHEN s.subscription_status = 'trial' THEN 'free_trial'
        WHEN s.requested_plan IN ('basic_490', 'pro_990') THEN s.requested_plan
        ELSE 'free_trial'
    END,
    CASE s.subscription_status
        WHEN 'active' THEN 'active'
        WHEN 'past_due' THEN 'past_due'
        WHEN 'canceled' THEN 'canceled'
        WHEN 'unpaid' THEN 'unpaid'
        WHEN 'inactive' THEN 'incomplete'
        ELSE 'trialing'
    END,
    CASE
        WHEN s.subscription_status = 'trial' THEN s.trial_ends_at
        ELSE NULL
    END,
    false
FROM local_service.shops AS s
ON CONFLICT (shop_id) DO NOTHING;

-- Every future shop receives the same source-backed free-trial row in the
-- transaction that creates the shop.  This is a trigger-only helper, not an
-- RPC API surface.  It needs definer rights to preserve the invariant even if
-- a future trusted shop-creation path lacks direct subscriptions privileges;
-- fixed search_path plus revoked EXECUTE keep it non-callable by app roles.
CREATE OR REPLACE FUNCTION local_service.initialize_shop_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    INSERT INTO local_service.subscriptions (
        shop_id,
        plan,
        status,
        current_period_end,
        cancel_at_period_end
    ) VALUES (
        NEW.id,
        CASE
            WHEN NEW.subscription_status = 'trial' THEN 'free_trial'
            WHEN NEW.requested_plan IN ('basic_490', 'pro_990') THEN NEW.requested_plan
            ELSE 'free_trial'
        END,
        CASE NEW.subscription_status
            WHEN 'active' THEN 'active'
            WHEN 'past_due' THEN 'past_due'
            WHEN 'canceled' THEN 'canceled'
            WHEN 'unpaid' THEN 'unpaid'
            WHEN 'inactive' THEN 'incomplete'
            ELSE 'trialing'
        END,
        CASE
            WHEN NEW.subscription_status = 'trial' THEN NEW.trial_ends_at
            ELSE NULL
        END,
        false
    )
    ON CONFLICT (shop_id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION local_service.initialize_shop_subscription()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_initialize_shop_subscription ON local_service.shops;
CREATE TRIGGER trg_initialize_shop_subscription
    AFTER INSERT ON local_service.shops
    FOR EACH ROW
    EXECUTE FUNCTION local_service.initialize_shop_subscription();

-- Public consumers receive one product-safe boolean only.  The view continues
-- to expose the fixed profile columns already approved in E3.3, while keeping
-- subscription status, trial end, plan, Stripe IDs, and payment data private.
-- A missing subscription row is fail-closed; the backfill and trigger above
-- make that condition exceptional rather than a normal shop state.
CREATE OR REPLACE VIEW local_service.shop_public_profile AS
SELECT
    s.id,
    s.name,
    s.slug,
    s.phone,
    s.address,
    s.line_oa_id,
    s.promptpay_number,
    s.promptpay_name,
    s.require_deposit,
    s.default_deposit_amount,
    CASE
        WHEN sub.shop_id IS NULL THEN false
        WHEN sub.status IN ('canceled', 'incomplete', 'incomplete_expired', 'unpaid') THEN false
        WHEN sub.status = 'trialing'
             AND COALESCE(sub.current_period_end, s.trial_ends_at) IS NULL THEN false
        WHEN sub.status = 'trialing'
             AND COALESCE(sub.current_period_end, s.trial_ends_at) <= NOW() THEN false
        WHEN sub.status IN ('trialing', 'active', 'past_due') THEN true
        ELSE false
    END AS is_accepting_online_bookings
FROM local_service.shops AS s
LEFT JOIN local_service.subscriptions AS sub
    ON sub.shop_id = s.id
WHERE s.is_active = true;

GRANT SELECT ON local_service.shop_public_profile TO anon, authenticated;

-- Enforce the same rule at persistence time.  The public create_booking_hold
-- RPC is SECURITY DEFINER and inserts into bookings, so this BEFORE INSERT
-- trigger makes a manipulated consumer client fail with the same generic error
-- instead of creating a booking for a blocked shop.  It also protects any
-- future trusted insert path.  It intentionally does not block active rows
-- scheduled for cancellation or past_due rows: both remain bookable until a
-- Stripe webhook changes their subscription status.
CREATE OR REPLACE FUNCTION local_service.enforce_shop_booking_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_subscription_status TEXT;
    v_trial_period_end TIMESTAMPTZ;
BEGIN
    SELECT
        sub.status,
        COALESCE(sub.current_period_end, s.trial_ends_at)
    INTO v_subscription_status, v_trial_period_end
    FROM local_service.shops AS s
    LEFT JOIN local_service.subscriptions AS sub
        ON sub.shop_id = s.id
    WHERE s.id = NEW.shop_id
      AND s.is_active = true;

    IF NOT FOUND
       OR v_subscription_status IS NULL
       OR v_subscription_status IN ('canceled', 'incomplete', 'incomplete_expired', 'unpaid')
       OR (
            v_subscription_status = 'trialing'
            AND (
                v_trial_period_end IS NULL
                OR v_trial_period_end <= NOW()
            )
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SHOP_NOT_ACCEPTING_ONLINE_BOOKINGS';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION local_service.enforce_shop_booking_acceptance()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_shop_booking_acceptance ON local_service.bookings;
CREATE TRIGGER trg_enforce_shop_booking_acceptance
    BEFORE INSERT ON local_service.bookings
    FOR EACH ROW
    EXECUTE FUNCTION local_service.enforce_shop_booking_acceptance();
