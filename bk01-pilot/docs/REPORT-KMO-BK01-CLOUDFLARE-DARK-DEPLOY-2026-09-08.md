# REPORT — KMO BK01 Cloudflare Dark Deployment — 2026-09-08

## Verdict

**PASS — DARK DEPLOYMENT ONLY**

BK01 Admin and Consumer are deployed to KMO-owned Cloudflare Workers and are reachable through KMO `workers.dev` endpoints. This checkpoint does **not** authorize customer cutover, custom-domain routing, production cron, LINE production webhook, or payment go-live.

## Isolation / ownership

- Wrangler named auth profile: `kmo`
- Profile is bound only to `D:\AI-Workspace\projects\kmorackbarcustom.github.io\bk01-pilot`
- Outside the KMO pilot directory, Wrangler was verified `loggedIn=false`
- No global `CLOUDFLARE_API_TOKEN` override was present
- No global `CLOUDFLARE_ACCOUNT_ID` override was present
- KMO Cloudflare account lock is recorded in both Worker configs via `account_id`
- Canonical WSTERA BK01 was not modified by this deployment

## KMO workers.dev namespace

Account-level workers.dev subdomain:

`kmo-rackbarcustom.workers.dev`

It was registered using the OAuth credential already held by the isolated `kmo` Wrangler profile. No separate Cloudflare API token was created or committed.

## Current deployments

### Admin

- Worker: `kmo-booking-admin`
- URL: `https://kmo-booking-admin.kmo-rackbarcustom.workers.dev`
- Current version: `b6aa98b3-8421-4970-bf2a-2cdce2ebbb4c`
- Previous bootstrap version: `e6a26fb8-40fa-4510-a58d-e412665e14c2`

### Consumer

- Worker: `kmo-booking-consumer`
- URL: `https://kmo-booking-consumer.kmo-rackbarcustom.workers.dev`
- Current version: `63785ea5-6462-4769-a139-a890e9a867f8`
- Previous bootstrap version: `36bbabcc-e78e-4af2-bf45-3e5c4c41f8ca`

Remote verification:

- Worker secrets: none on Admin
- Worker secrets: none on Consumer
- Cron schedules: empty on Admin
- Cron schedules: empty on Consumer
- Custom domains: `0`
- workers.dev access: enabled

The Consumer dark deployment uses `wrangler.dark.jsonc`, intentionally omitting the normal five-minute notification cron.

## Build safety

OpenNext production artifacts were rebuilt from clean generated directories with a temporary public-only build environment.

Production build overrides:

- Admin public URL → KMO Admin workers.dev endpoint
- Booking public URL → KMO Consumer workers.dev endpoint

After each build the original `.env.local` was restored.

Exact-value artifact scans returned no embedded real server credential for:

- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `NOTIFICATION_DISPATCH_SECRET`
- `LINE_MERCHANT_CHANNELS_JSON`

Both expected KMO workers.dev public URLs were verified present in the generated deployment artifacts.

No real Worker secret was uploaded in this phase.

## Cloudflare compatibility correction

Initial OpenNext Admin build failed because the active KMO copy still used Next.js `src/proxy.ts`, which OpenNext classified as unsupported Node.js middleware.

Canonical BK01 snapshot `4a694bc` already contains the compatible form:

- `src/middleware.ts`
- `middleware(request)` calling the same Supabase `updateSession`
- `runtime = 'experimental-edge'`

That upstream correction was promoted into KMO without changing its session semantics. The following OpenNext Admin build then passed.

KMO also added `.open-next/**` to the Admin ESLint global ignores so generated Cloudflare bundles are not linted as application source. Consumer already had the same generated-directory ignore.

## Verification

- BK01 pilot tests: `18/18 PASS`
- Consumer lint: `0 errors`, 7 existing warnings
- Admin lint: `0 errors`, 1 existing warning
- `git diff --check`: PASS
- Admin OpenNext build: PASS
- Consumer OpenNext build: PASS

## Live route smoke

Node HTTPS smoke against deployed Workers:

- Admin `/login` → `200`
- Admin `/dashboard` while unauthenticated → `307` to `/login?next=/dashboard`
- Consumer `/` → `307` to `/book/kmo-rackbarcustom`
- Consumer `/book/kmo-rackbarcustom` → `200`
- No `Internal Server Error`
- No application-error marker
- No missing-Supabase-configuration marker
- Admin HTML contains KMO/login content
- Consumer HTML contains KMO/Booking content

Windows PowerShell/curl Schannel could not negotiate the newly created workers.dev TLS endpoint during early propagation, while Node/OpenSSL requests succeeded. This was treated as a local TLS-stack observation, not a Worker application failure.

## Remaining hard gates

1. Owner-authenticated Admin browser E2E on the workers.dev Admin URL.
2. Customer Booking E2E including create/manage/reschedule/cancel behavior.
3. Real PromptPay or approved reusable static QR and deposit/slip verification.
4. Production LINE OA/LIFF credentials and behavior verification.
5. Notification secret + cron enablement only after LINE/notification readiness.
6. Security/rollback verification after production configuration exists.
7. Custom domain binding and legacy KMO booking cutover only after all prior gates pass.

**No production cutover and no Git push were performed by this checkpoint.**
