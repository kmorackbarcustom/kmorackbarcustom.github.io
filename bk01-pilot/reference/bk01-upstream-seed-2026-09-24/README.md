# BK01 upstream seed pack — 2026-09-24

> **BK01 upstream seed pack is reference/provenance material only. Presence in the repository does not mean the capability is implemented, authorized, deployed, or active.**

Brief: `bk01-pilot/docs/BRIEF-KMO-BK01-UPSTREAM-SEED-PACK-2026-09-24.md`
Work type: `REFERENCE IMPORT / PROVENANCE PRESERVATION` — not D1A implementation.

## What this is

A quarantined copy of reusable BK01 (`Gutumrod/booking`) source, tests, design docs and R4 proof evidence, pinned to exact upstream commits, so future KMO work can selectively adapt proven upstream work without re-researching BK01.

## What this is not

- Not wired into any KMO runtime, route, build, test run, database, deployment, Order, Claim, or KMO Control.
- Not an implementation of Public Portal, Order, or Claim. Order is `NOT_AUTHORIZED_YET`; Claim runtime stays disabled.
- Not a replacement for KMO weekly schedule, KMO production capacity (`public.production_allocations`), or KMO identity/bridge.

## Why it is inert

- `bk01-pilot/package.json` workspaces are only `apps/booking-consumer` and `apps/booking-admin`.
- App `tsconfig.json` `include` globs are relative to each app directory, so `bk01-pilot/reference/**` is outside them.
- `npm test` runs `tests/*.test.ts` (non-recursive, `bk01-pilot/tests/` only).
- Next.js routes are only discovered under `apps/*/src/app`; the copied `page.tsx` files here register nothing.
- Upstream `order/catalog` package/build manifests (`package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`) were intentionally **not** copied (INVENTORY_ONLY) to avoid tooling / dependency-graph pickup.

Copied files keep their upstream imports (e.g. `@/lib/...`); they will not resolve here and are not meant to.

## Layout

```text
bk01-upstream-seed-2026-09-24/
├── README.md            this file
├── MANIFEST.md          one row per imported / inventory-only item, exact ref + blob
├── IMPORT_MAP.md        future intent per concept
├── ALREADY_PRESENT.md   BK01 files already byte-identical in KMO (not forked)
├── .gitattributes       `* -text` so committed blobs equal upstream blobs
├── booking-r4/          @ 3b3a333 (source/tests), @ 50555c1 (evidence)
│   ├── consumer/src/lib/
│   ├── admin/src/lib/
│   ├── tests/
│   └── evidence/        text/JSON only; PNGs + repair SQL are INVENTORY_ONLY
├── public-portal-claim/ @ 45fa3ab
│   ├── source/booking-consumer/...
│   ├── tests/
│   └── docs/
└── order-safe-scaffold/ @ 9821881
    ├── source/order/{core,catalog}/..., source/booking-{consumer,admin}/...
    ├── tests/
    └── docs/
```

Inside each bucket the upstream-relative path is preserved with the `apps/` / `docs/order/` / `docs/audit/r4-2026-09-23/` prefix stripped (MANIFEST has the full mapping). This avoids collisions between the several upstream `page.tsx` files.

## Data notes

- Evidence JSON contains the KMO shop's public contact phone as rendered on the public booking page. No customer data, credentials, tokens, or env files are included (scanned before commit).
- Test fixtures use placeholder phones (`0812345678`, `0800000000`).

## Verifying provenance

```bash
# from bk01-pilot/reference/bk01-upstream-seed-2026-09-24, with BK01 checked out at $BK
git -C "$BK" rev-parse <ref>:<upstream path>    # expected blob (MANIFEST column)
git ls-files -s <local path>                    # committed blob — must match
```
