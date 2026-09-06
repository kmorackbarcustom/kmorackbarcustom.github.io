# KMO BK01 Pilot — Mandatory Rules

> STOP: Read this file before modifying anything under `bk01-pilot/`.

This directory is a **controlled KMO deployment copy** of WSTERA BK01.
It is **not** the canonical BK01 repository and must never become a silent product fork.

## 1. Canonical boundary — NON-NEGOTIABLE
- Canonical BK01 lives at `D:\AI-Workspace\projects\saas-product-hub\products\booking`.
- KMO work lives only in `D:\AI-Workspace\projects\kmorackbarcustom.github.io\bk01-pilot`.
- Do **not** edit, commit, reset, clean, rebase, merge, push, or otherwise mutate canonical BK01 while performing KMO work.
- Never push KMO-specific changes back into canonical BK01.
- Before any sync, read `UPSTREAM.md` and verify the exact upstream commit/ref.

## 2. What may change in KMO
KMO-only changes are allowed when they are deployment or business-specific, including:
- KMO branding/theme/copy and `Powered by WSTERA` attribution config.
- KMO-owned domain, Cloudflare Worker names, environment and runtime configuration.
- KMO-owned Supabase configuration, data mapping and deployment overlays.
- KMO-specific shop settings, PromptPay recipient configuration and operational integrations.
- KMO-specific payment/order workflows that do not redefine BK01 canonical booking behavior.

## 3. Generic defects must go upstream first
If a defect is generic to BK01 rather than KMO-specific:
1. Reproduce and record evidence.
2. Classify it as a canonical BK01 defect.
3. Fix and verify it in canonical BK01 through the normal WSTERA process.
4. Use a committed upstream ref/release.
5. Re-sync that verified change into KMO.

Never silently fix a generic BK01 defect only in this directory.

## 4. Runtime independence
- KMO production must use KMO-owned GitHub, Supabase, Cloudflare, DNS and secrets only.
- No dependency on WSTERA HOME-PC, Hermes, S-Bridge, WSTERA Supabase or WSTERA Cloudflare runtime.
- Never copy WSTERA production secrets into KMO.
- Service-role or equivalent privileged credentials are server-only and must never be exposed to browser/public env.

## 5. KMO is Stripe-free
- Do not add Stripe Checkout, Customer Portal, Stripe webhook runtime, Stripe env vars or Stripe billing UI to KMO.
- The canonical `subscriptions` schema may remain only where required for BK01 booking-entitlement compatibility.
- Do not delete compatibility migrations merely because KMO does not use Stripe; migration removal requires dependency review first.

## 6. Customer payment rules
- BK01 owns **booking deposit** flow only: amount -> dynamic PromptPay QR -> slip -> review/verification -> booking confirmation.
- Full job/order collection belongs to a separate KMO payment-request/order layer; do not turn BK01 booking core into shop accounting.
- Never guess a PromptPay recipient. Dynamic QR may use only a verified supported PromptPay alias.
- Current generator accepts a Thai mobile number (10 digits starting `0`) or a 13-digit PromptPay identifier.
- Do not feed an ordinary bank-account number into the PromptPay generator unless its supported identity is independently verified.
- AI/vision detecting a slip is notification evidence only, **not proof that money reached the bank account**.
- LINE/Telegram notifications must not directly mark payment as verified.

## 7. Database and production safety
- Inspect KMO remote schema, migrations and RLS before any database mutation.
- Confirm a recoverable backup/rollback path before applying migrations.
- Do not blindly replay all historical BK01 migrations into an existing KMO database.
- Existing KMO production booking remains the rollback/fallback until pilot cutover gates pass.
- Do not overwrite or remove legacy `booking.html` / `bookingdashboard.html` during pilot preparation.

## 8. Deployment gate
Before production cutover, require evidence for: tests/build, KMO Supabase/RLS, Cloudflare deploy, domain routing, browser/mobile E2E, payment/deposit flow, admin auth, notification path and rollback.
If any required gate is unknown, report `BLOCKED` or `NOT VERIFIED`; never invent PASS evidence.

## 9. Required read order before work
1. `AGENTS.md` — this rule set.
2. `README.md` — pilot scope.
3. `UPSTREAM.md` — canonical copy/sync boundary.
4. `DEPLOYMENT.md` — production gates and hard stops.
5. `KMO_PAYMENT_FLOW.md` — KMO payment architecture when payment work is involved.
6. Latest relevant KMO daily log before claiming current state.

## 10. Change protocol
- Inspect actual state before editing; do not assume docs are current.
- Keep KMO deltas minimal and attributable.
- Never expose secrets in commits, logs, screenshots or reports.
- Run relevant tests/lint/build after source changes.
- Record generic defects separately from KMO-specific issues.
- Commit KMO work only to the KMO repository/branch unless the Owner explicitly authorizes another target.
- Preserve attribution: `Powered by WSTERA` -> `https://by.wstera.com` unless the Owner changes this rule.

## Final rule
When uncertain whether a change belongs to KMO or canonical BK01, **do not mutate canonical**. Classify and document first. KMO safety and upstream integrity take priority over convenience.
