# I18N Phase 4 Evidence — booking-admin

Date: 2026-08-20 (Asia/Bangkok)
Repo: `products/booking`
App: `apps/booking-admin`
Status: **Implementation done on disk, verified by Hermes verify-gate. NOT committed/pushed (Claude commits per claude-owns-git-commits rule).**

## What changed (per brief Phase 4)

- `apps/booking-admin/package.json` — added `next-intl` (only new runtime dependency).
- `apps/booking-admin/messages/th.json` + `en.json` — nested dictionaries: `common`, `landing`, `auth`, `dashboard`, `tickets`, `ticketDomain` (6 top-level sections each, **key parity verified** — no th-only/en-only keys).
- `apps/booking-admin/src/i18n/config.ts`, `locale-provider.tsx`, `messages.ts`, `ticket-i18n.ts` — replicated next-intl setup from Phase 1 (cookie-based `saas_locale`, default `th`).
- `apps/booking-admin/src/app/layout.tsx:29` — `lang={locale}` (fixed hardcoded `lang="en"`).
- Localized pages: `src/app/page.tsx`, `login`, `register`, `forgot-password`, `dashboard/page.tsx`, `dashboard/tickets/*` (list, [id], new).
- `src/app/dashboard/page.tsx` uses `useTranslations` (5 call sites).

## Verification evidence (Hermes ran these)

- `npx tsc --noEmit` → **exit 0** (clean).
- `npm run build` → **exit 0** (build succeeds; full route list compiled incl. /dashboard, /login, /register, /forgot-password, /platform-admin).
- Dictionary parity: `python` compare → th keys 6 = en keys 6, th-only `[]`, en-only `[]` (both have `common/landing/auth/dashboard/tickets/ticketDomain`).

## Deferred / untouched (per hard stops)

- `src/app/platform-admin/` → git status **empty (untouched)** — P2 deferred, correctly left alone.
- No `next.config.*`, middleware, or auth-logic changes beyond reading the locale cookie.
- No dependency added beyond `next-intl`.

## Cookie note

Replicated Phase 1's `locale` cookie name (shared across the two booking apps) so owner/consumer language preference is consistent — same approach as Phase 1.

## Hard stops respected
- No commit, no push (Claude commits).
- platform-admin untouched. No unrelated refactors.
