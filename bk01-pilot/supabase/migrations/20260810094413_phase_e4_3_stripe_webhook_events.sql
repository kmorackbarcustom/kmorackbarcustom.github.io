-- Phase E4.3: Stripe webhook idempotency log table.
-- Per STRIPE_SUBSCRIPTION_STATE_MACHINE.md section 4.3.1:
--   id          = Stripe Event ID (e.g. 'evt_3M1234567890'), PRIMARY KEY, text
--   type        = Stripe event type (e.g. 'checkout.session.completed'), text NOT NULL
--   created_at  = Stripe event creation timestamp, timestamptz NOT NULL
--   processed_at = when our handler processed it, timestamptz NOT NULL DEFAULT now()
-- service_role (used by the webhook handler) bypasses RLS and is the only writer.
-- No grants to anon/authenticated — same lockdown pattern as the subscriptions
-- table in 20260809000000_phase_e4_1_subscriptions_schema.sql.

CREATE TABLE local_service.stripe_webhook_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE local_service.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON local_service.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON local_service.stripe_webhook_events TO service_role;