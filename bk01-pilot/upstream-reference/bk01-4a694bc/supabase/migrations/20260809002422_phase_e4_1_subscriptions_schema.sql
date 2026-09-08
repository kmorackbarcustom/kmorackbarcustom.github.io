-- Phase E4.1: subscriptions table for Stripe billing state.
-- Schema only -- Stripe account not yet provisioned, so no RPC/webhook wiring
-- here. service_role (used by the future webhook handler) bypasses RLS and
-- is the only writer until E4.3. Owner-only read matches PRODUCT_RULES_V1
-- section 7 ("จัดการแพ็กเกจและการชำระเงิน" = owner only, admin/staff no access).

CREATE TABLE local_service.subscriptions (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    shop_id UUID NOT NULL UNIQUE REFERENCES local_service.shops(id),
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    plan VARCHAR(20) NOT NULL DEFAULT 'free_trial'
        CHECK (plan IN ('free_trial', 'basic_490', 'pro_990')),
    status VARCHAR(20) NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_shop_id_idx ON local_service.subscriptions(shop_id);

ALTER TABLE local_service.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner views own subscription"
ON local_service.subscriptions
FOR SELECT
TO authenticated
USING (local_service.is_shop_owner(shop_id));

REVOKE ALL ON local_service.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON local_service.subscriptions TO authenticated;
GRANT ALL ON local_service.subscriptions TO service_role;
