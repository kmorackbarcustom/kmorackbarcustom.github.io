# Platform Admin Auth Guard — QA Verification Report

**Verifier:** Qwen Code (QA/Verifier role)
**Date:** 2026-08-14
**Repo:** `D:\AI-Workspace\projects\saas-product-hub\local-service-booking-saas`
**Scope:** Static + runtime verification of uncommitted "platform admin" auth-guard source. No login credentials were available; no login was attempted.

---

## What was checked

1. **Static consistency** — every `supabase.rpc(...)` name in `platform-admin-service.ts` (4 RPCs) and the `is_platform_admin` RPC in `layout.tsx` has a matching `CREATE OR REPLACE FUNCTION local_service.<name>` in the migration, with matching parameter names/order.
2. **Dev server startup** — `npm run dev` for `apps/booking-admin`, watch for compile errors.
3. **Unauthenticated redirect** — `GET /platform-admin` with no session must return a redirect whose `Location` points to `/login?next=/platform-admin`.
4. **Login page Thai copy** — `GET /login` rendered HTML must contain `สำหรับเจ้าของร้านค้าและผู้ดูแลระบบ`.
5. **Server error scan** — scan dev-server stdout/stderr for runtime/hydration errors triggered by the two requests.
6. **Clean shutdown** — stop the dev server and free the port.

---

## Check 1 — Static consistency (RPC names ↔ migration functions) — PASS

### RPCs called in `apps/booking-admin/src/lib/platform-admin-service.ts`

| # | `supabase.rpc(...)` call                                  | Params passed (object keys)            |
|---|-----------------------------------------------------------|-----------------------------------------|
| 1 | `supabase.rpc('platform_admin_list_shops')`               | (none)                                  |
| 2 | `supabase.rpc('platform_admin_set_shop_active', {...})`   | `p_shop_id`, `p_is_active`              |
| 3 | `supabase.rpc('platform_admin_extend_trial', {...})`      | `p_shop_id`, `p_days`                   |
| 4 | `supabase.rpc('platform_admin_update_plan', {...})`       | `p_shop_id`, `p_plan`                   |

### RPC called in `apps/booking-admin/src/app/platform-admin/layout.tsx`

| # | Call                                            | Params |
|---|-------------------------------------------------|--------|
| 5 | `supabase.rpc('is_platform_admin')`             | (none) |

### Matching `CREATE OR REPLACE FUNCTION` in
`supabase/migrations/20260813000000_platform_admin_authorization.sql`

| RPC name                            | Function signature in migration                                                              | Match |
|-------------------------------------|----------------------------------------------------------------------------------------------|-------|
| `is_platform_admin`                 | `local_service.is_platform_admin()` (no params)                                             | ✓     |
| `platform_admin_list_shops`         | `local_service.platform_admin_list_shops()` (no params)                                     | ✓     |
| `platform_admin_set_shop_active`     | `local_service.platform_admin_set_shop_active(p_shop_id UUID, p_is_active BOOLEAN)`         | ✓     |
| `platform_admin_extend_trial`       | `local_service.platform_admin_extend_trial(p_shop_id UUID, p_days INTEGER)`                  | ✓     |
| `platform_admin_update_plan`        | `local_service.platform_admin_update_plan(p_shop_id UUID, p_plan TEXT)`                       | ✓     |

All 5 RPC names exist in the migration. Parameter names and order match exactly for all 4 parametrized RPCs; the 2 parameterless RPCs match too. All functions are `SECURITY DEFINER`, `REVOKE`d from `PUBLIC/anon/service_role`, and `GRANT`ed `EXECUTE` to `authenticated` only — consistent with the intended privilege model.

**Verdict: PASS — no mismatch.**

---

## Check 2 — Dev server startup — PASS (with a port-substitution caveat)

### Port conflict on 3001 (pre-existing, not caused by this task)

`npm run dev` (which runs `next dev -p 3001`) failed immediately:

```
> booking-admin@0.1.0 dev
> next dev -p 3001

⨯ Failed to start server
Error: listen EADDRINUSE: address already in use :::3001
    at <unknown> (Error: listen EADDRINUSE: address already in use :::3001)
npm error code 1
```

Investigation: port 3001 is held by **a different project**, not booking-admin.

```
PID 33216 | node.exe
CommandLine: "C:\Program Files\nodejs\node.exe" --require
  D:\AI-Workspace\projects\saas-product-hub\service-booking-saas\node_modules\tsx\dist\preflight.cjs
  --import file:///D:/AI-Workspace/projects/saas-product-hub/service-booking-saas/node_modules/tsx/dist/loader.mjs
  server/_core/index.ts
StartTime: 8/14/2026 12:32:21 PM
```

That process is the sibling `service-booking-saas` repo's Express/Vite SPA server (probe of `http://localhost:3001/` returned `X-Powered-By: Express`, `@vite/client`, `<div id="root">` — a Vite SPA shell, not the Next.js booking-admin). It serves the same SPA shell for every route, so it could not satisfy checks 3/4.

**Decision:** I did **not** kill PID 33216 — it is the user's pre-existing running process from another project, which is out of scope and destructive to terminate without authorization. Instead I started `apps/booking-admin` on an alternate free port, **3010**, via `npm run dev -- -p 3010`. Redirect targets in this codebase are relative (`/login?next=/platform-admin`), so the port substitution does not affect the validity of checks 3 and 4.

### Startup on port 3010 — clean, no compile errors

```
> booking-admin@0.1.0 dev
> next dev -p 3001 -p 3010

▲ Next.js 16.3.0 (Turbopack)
- Local:         http://localhost:3010
- Network:       http://100.110.5.104:3010
- Environments: .env.local
✓ Ready in 537ms
✓ Running next.config.ts took 45ms
```

No TypeScript/compile errors at boot. `.env.local` was picked up (hardlinked into the app dir as stated in the brief; I did not create or read it).

**Verdict: PASS** (booking-admin compiles and boots cleanly; the 3001 EADDRINUSE is a pre-existing environmental conflict from another project, not a defect in the code under review).

---

## Check 3 — Unauthenticated redirect — PASS

Command: `curl -i -s --max-time 15 http://localhost:3010/platform-admin` (no `-L`, no cookies)

Raw response headers (verbatim):

```
HTTP/1.1 307 Temporary Redirect
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
Link: </_next/static/media/797e433ab948586e-s.p.0r6juujl39pe6.woff2>; rel=preload; as=font; crossorigin=""; type=font/woff2, </_next/static/media/caa3a2e1cccd8315-s.p.0wgildi0cnwt9.woff2>; rel=preload; as=font; crossorigin=""; type=font/woff2, </_next/static/chunks/%5Broot-of-the-server%5D__0pwc8yp._.css>; rel=preload; as=style
location: /login?next=/platform-admin
Cache-Control: no-cache, must-revalidate
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Date: Fri, 14 Aug 2026 06:00:39 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked
```

Status `307` and `location: /login?next=/platform-admin` — exactly the redirect `layout.tsx` is expected to issue for an unauthenticated visitor (it calls `redirect('/login?next=/platform-admin')` when `supabase.auth.getClaims()` errors / has no `sub`).

The response body is Next.js dev mode's standard redirect scaffold, which surfaces the redirect via a `<template data-next-error-message="NEXT_REDIRECT" data-next-error-digest="NEXT_REDIRECT;replace;/login?next=/platform-admin;307;">`. This is the **expected** internal representation of a `redirect()` in dev; it is not a runtime error (see Check 5).

**Verdict: PASS.**

---

## Check 4 — Login page Thai copy — PASS

Command: `curl -s --max-time 15 http://localhost:3010/login` then `grep` for the target string.

The string **is** present in the initial server-rendered HTML (1 match):

```
$ grep -c "สำหรับเจ้าของร้านค้าและผู้ดูแลระบบ" /tmp/qwen_login_3010.html
1

$ grep -o ".\{0,30\}สำหรับเจ้าของร้านค้าและผู้ดูแลระบบ.\{0,30\}" /tmp/qwen_login_3010.html
"mt-1 text-xs text-slate-400">สำหรับเจ้าของร้านค้าและผู้ดูแลระบบ ใช้อีเมลแ□□
```

Context confirms it is inside the expected `<p className="mt-1 text-xs text-slate-400">` element under the `<h1>เข้าสู่ระบบ</h1>` heading in `login/page.tsx`.

Note: `login/page.tsx` is a `'use client'` component, but Next.js SSR still renders client components to HTML on the initial request, so the string appears in the initial payload. No client-only caveat applies here.

**Verdict: PASS.**

---

## Check 5 — Server error scan — PASS

Full dev-server stdout/stderr captured during the two requests:

```
 GET /platform-admin 307 in 727ms (next.js: 137ms, proxy.ts: 395ms, application-code: 195ms)
 GET /login 200 in 82ms (next.js: 19ms, proxy.ts: 5ms, application-code: 58ms)
```

- No `⨯` / `Error:` / `Unhandled` / ` hydration` / `TypeError` / `ReferenceError` lines in the server log.
- The `NEXT_REDIRECT` template + `Error: NEXT_REDIRECT` string seen in the `/platform-admin` response **body** is Next.js's documented dev-mode representation of an intentional `redirect()` call — it is the redirect mechanism itself, not a runtime failure. It is not emitted to the server's stderr and the request is logged as a normal `307` with a normal timing breakdown.
- The `/login` request completed `200` with no error markers.

**Verdict: PASS — no runtime errors, unhandled exceptions, or hydration errors triggered by either request.**

---

## Check 6 — Clean shutdown — PASS

- Stopped the background dev-server shell via `task_stop`.
- The npm parent was terminated, but the child `next start-server` process (PID 20132, `node ... next/dist/server/lib/start-server.js`) lingered and kept port 3010 in LISTENING. Since I had started it, I terminated it directly:
  - `Stop-Process -Id 20132 -Force` → confirmed `TERMINATED`.
- Post-shutdown port check:
  ```
  $ netstat -ano | findstr ":3010"
  TCP    [::1]:57509   [::1]:3010   TIME_WAIT   0
  TCP    [::1]:57515   [::1]:3010   TIME_WAIT   0
  ```
  Only `TIME_WAIT` socket remnants remain (kernel will clear them); no `LISTENING` process on 3010. Port is free.

**Note on port 3001:** The pre-existing process (PID 33216, the sibling `service-booking-saas` Express/Vite server) that was squatting on 3001 when I arrived was **left untouched** — I did not start it and killing another project's server is destructive and out of scope. Port 3001 remains occupied by that unrelated process.

**Verdict: PASS** (the booking-admin server I started is fully stopped and port 3010 is free).

---

## Mismatches / bugs found

- **No code or migration mismatches.** All 5 RPC names and their parameters align exactly between `platform-admin-service.ts` / `layout.tsx` and `20260813000000_platform_admin_authorization.sql`.
- **Environmental note (not a code bug):** Port 3001 was already occupied by a different project (`service-booking-saas`, PID 33216) at task start. I ran the runtime checks on port 3010 instead. This does not affect the validity of the redirect/copy checks because the redirects use relative paths. Flagging it so the human can decide whether to free 3001 before the next run on the canonical port.
- **Minor, non-blocking observation:** `npm run dev` script is hardcoded to `next dev -p 3001`; passing `-p 3010` produced `next dev -p 3001 -p 3010` (Next.js honored the last flag, hence it bound 3010). Behavior is correct but the doubled `-p` in the log is cosmetic only.

---

## Credential handling

No login credentials were provided or available. I did **not** attempt to log in, guess, fabricate, brute force, or otherwise bypass authentication. All runtime checks were performed against unauthenticated requests only. The `BROWSER_LOGIN_STILL_REQUIRED_BY_HUMAN` verdict below reflects that a human with real admin credentials must still perform an authenticated browser smoke test of the `/platform-admin` page (admin gate, shop list load, action buttons) — that path was intentionally out of reach of this verification.

---

**VERDICT: <BROWSER_LOGIN_STILL_REQUIRED_BY_HUMAN>**