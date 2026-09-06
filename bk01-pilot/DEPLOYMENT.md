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
