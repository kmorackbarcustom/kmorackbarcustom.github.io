# KMO BK01 Pilot — Deployment Runbook

## Targets
- Consumer Worker: `kmo-booking-consumer`
- Admin Worker: `kmo-booking-admin`
- Database: KMO-owned Supabase only
- DNS/Workers: KMO-owned Cloudflare only

## Local verification
1. Copy `.env.example` to `.env.local` and supply KMO-owned values.
2. `npm ci`
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. `npm audit`

## Production order
1. Record Git checkpoint and current KMO Supabase migration state.
2. Confirm a recoverable Supabase backup/rollback path.
3. Inspect remote schema/RLS before applying BK01 migrations.
4. Apply only the reviewed BK01 migration set to KMO Supabase.
5. Configure Worker secrets/environment without committing them.
6. Deploy consumer and admin Workers to KMO Cloudflare.
7. Bind KMO custom domains/DNS.
8. Smoke public booking, admin auth, create/view/update/reschedule/cancel, notifications and attribution.
9. Record the Cloudflare deployment IDs used for rollback.

## Current hard stops
Remote Supabase migration/RLS verification is blocked until KMO Supabase authentication is available.
Cloudflare deploy/domain/rollback verification is blocked until Wrangler is authenticated to the KMO Cloudflare account.
Do not cut over the existing KMO booking pages until these gates pass.

## KMO payment gates
- KMO uses design-partner entitlement; no Stripe checkout, portal, webhook, or runtime subscription query is required.
- Keep the BK01 entitlement/subscription table only because booking acceptance depends on it.
- Before enabling dynamic deposit QR, confirm the actual KMO PromptPay alias. The legacy bank-account-like value is not accepted by the current BK01 generator.
- Verify a real bank scan against a non-production/test amount before public cutover.
- Payment-proof image detection or Telegram notification must never mark a booking paid by itself.
- For full job/order balances, use the separate KMO payment-request capability described in `KMO_PAYMENT_FLOW.md`; do not overload BK01 booking state.
