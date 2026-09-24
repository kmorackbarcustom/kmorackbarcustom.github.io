# BRIEF — KMO BK01 UPSTREAM SEED PACK

Date: 2026-09-24 (Asia/Bangkok)  
Program: KMO RACKBARCUSTOM  
Work type: `REFERENCE IMPORT / PROVENANCE PRESERVATION`  
Preferred executor: AGY or any mechanical repository worker  
Reviewer: Codex, bounded read-only verification  
Canonical BK01: `Gutumrod/booking`  
KMO repo: `kmorackbarcustom/kmorackbarcustom.github.io`

## 1. Objective

Prepare a quarantined reference pack of reusable BK01 source, tests, and evidence inside the KMO repository so future KMO implementation can selectively adapt proven upstream work without re-researching BK01.

This task is **not D1A implementation**.

The imported material must not be wired into active KMO runtime, routes, database, deployment, Order, Claim, or KMO Control during this task.

## 2. Evidence baseline

KMO reconciliation baseline before this brief:

`76ea6dc1ef6a1874bfefe6016c886069438de977`

Current KMO branch lineage:

`task/KMO-DOMAIN-BOOKING-READINESS-001-booking-ready-for-control`

BK01 R4 reviewed source:

`3b3a3338de029a058aa5763c806be42f8a5205ca`

BK01 R4 closure/evidence:

`50555c14d1c578caabc421dbad995c8f2b80709e`

BK01 final documentation reconciliation:

`5aea75856dcaa05dd5e03dd3247c18e301736059`

BK01 Public Portal + Claim safe lane:

`45fa3abf5a316dea622b005bfced1acf948cb8bc`

BK01 Order safe scaffold:

`982188170f6a80ce492723786ca1e21cc2435733`

Execution must pin exact refs; never use `latest`.

## 3. Execution branch

Create an isolated branch from the exact KMO brief-bearing checkpoint that contains this document:

`prep/kmo-bk01-upstream-seed-20260924`

Do not edit or commit into another dirty worktree.

## 4. Destination

Create:

```text
bk01-pilot/reference/bk01-upstream-seed-2026-09-24/
```

Target layout:

```text
bk01-upstream-seed-2026-09-24/
├── README.md
├── MANIFEST.md
├── IMPORT_MAP.md
├── ALREADY_PRESENT.md
├── booking-r4/
│   ├── consumer/
│   ├── admin/
│   ├── tests/
│   └── evidence/
├── public-portal-claim/
│   ├── source/
│   ├── tests/
│   └── docs/
└── order-safe-scaffold/
    ├── source/
    ├── tests/
    └── docs/
```

Imported source should remain as close to the exact upstream content as possible.

Do not modify imported source to make it fit KMO during this task. Record future adaptation decisions in `IMPORT_MAP.md`.

## 5. Source A — BK01 R4 reference set

### 5.1 Customer truthful-state resolver

Copy from BK01 R4:

```text
apps/booking-consumer/src/lib/booking-state.ts
tests/booking-state.test.ts
```

Future KMO use:

```text
LOADING
LOAD_ERROR
SHOP_NOT_FOUND
BOOKING_DISABLED
NO_SERVICES
NO_STAFF
NO_SCHEDULE
PAYMENT_NOT_CONFIGURED
OK
```

KMO will later adapt this around its own weekly schedule and availability model.

### 5.2 Query-result truth

Copy:

```text
apps/booking-consumer/src/lib/load-result.ts
tests/load-result.test.ts
```

Required concept:

- query failure is not an empty result;
- RLS/network/read failure must surface as error;
- zero rows may become empty/not-found only after a successful query.

### 5.3 Payment instruction authority

Copy:

```text
apps/booking-consumer/src/lib/payment-instruction.ts
tests/payment-instruction.test.ts
```

Required concepts:

- server-authoritative deposit amount;
- configured valid PromptPay identity;
- no invented recipient/name;
- no invented amount;
- fail closed when the payment tuple is incomplete;
- bounded PromptPay QR generation contract.

KMO static-QR support must not be deleted merely to match BK01.

### 5.4 Admin readiness model

Copy:

```text
apps/booking-admin/src/lib/readiness.ts
tests/readiness.test.ts
```

Future KMO readiness may extend the upstream model with:

```text
shop profile
services
staff/resources
shop weekly schedule
staff schedule
special holidays
payment
LINE
public Booking
Order capability
Claim capability
production capacity
```

### 5.5 Schedule dirty-state model

Copy:

```text
apps/booking-admin/src/lib/schedule-merge.ts
tests/schedule-merge.test.ts
```

Preserve concepts:

- dirty staff tracking;
- background refresh cannot erase local unsaved edits;
- basis for save-all and unsaved-change warning.

Do not replace KMO's existing failed-save rollback semantics.

Future intended combination:

```text
BK01 dirty-state UX
+
KMO failed-card rollback
+
KMO shop-weekly truth
```

## 6. Source B — Public Portal + Claim safe lane

Exact source:

`45fa3abf5a316dea622b005bfced1acf948cb8bc`

This material is **reference only**. Claim runtime must remain disabled after import.

### 6.1 Public Portal

Copy:

```text
apps/booking-consumer/src/lib/public-portal.ts
apps/booking-consumer/src/app/shop/[slug]/page.tsx
```

Preserve relevant portal i18n material from:

```text
apps/booking-consumer/messages/th.json
apps/booking-consumer/messages/en.json
```

Do not overwrite active KMO message files. Store reference copies or extracted reference material inside the seed pack.

Future KMO customer contract:

```text
ONE CUSTOMER LINK
        │
        ├── Booking
        ├── Order
        └── Claim
```

Capability model:

```text
bookingEnabled
orderEnabled
claimEnabled
```

Important rule:

```text
undefined/null != enabled
```

Capabilities must be explicitly enabled. Disabled capability must not expose a usable dead intake route.

### 6.2 Claim reference pack

Copy:

```text
apps/booking-consumer/src/lib/public-claim.ts
apps/booking-consumer/src/app/shop/[slug]/claim/page.tsx
apps/booking-consumer/src/app/claim/track/page.tsx
apps/booking-consumer/src/components/claim-entry-point.tsx
tests/public-portal-claim.test.ts
```

Copy supporting evidence:

```text
docs/order/CLAUDE-PUBLIC-CLAIM-THREAT-MODEL-2026-09-08.md
docs/order/CLAUDE-PUBLIC-PORTAL-CLAIM-IMPLEMENTATION-EVIDENCE-2026-09-08.md
docs/order/CLAUDE-PORTAL-CLAIM-RUNTIME-HANDOFF-2026-09-08.md
```

Preserve future KMO concepts:

```text
Booking → Claim
Order → Claim
Standalone Claim
```

Architecture direction:

```text
Public Claim UI
      ↓
Public Claim Contract
      ↓
Adapter
      ↓
Authoritative Claim / Ticket / Case Engine
```

Security concepts to preserve:

- naked UUID is not customer authority;
- phone number is not claim-tracking authority;
- use opaque customer-held tracking token;
- idempotency key on submission;
- customer cannot control internal Ticket/Case fields;
- public tracking uses an explicit whitelist projection;
- internal status is collapsed into coarse customer-safe states;
- unavailable runtime must fail truthfully;
- never fabricate successful Claim state.

Customer-safe public states:

```text
received
in_review
waiting_for_you
resolved
closed
```

Hard rule: do not activate `/shop/[slug]`, `/shop/[slug]/claim`, or `/claim/track` from this reference pack.

## 7. Source C — BK01 Order safe scaffold

Exact upstream ref:

`982188170f6a80ce492723786ca1e21cc2435733`

Order remains `NOT_AUTHORIZED_YET` for KMO implementation.

Inventory the exact tree at that ref and copy reference material from the upstream-owned Order areas when present, including:

```text
order/core/**
order/catalog-adaptation.ts
order/catalog/**
tests/order-domain.test.ts
docs/order/CODEX-ORDER-SAFE-SCAFFOLD-EVIDENCE-2026-09-08.md
```

Also include relevant safe-lane Order consumer/admin reference surfaces and directly referenced design/handoff docs that explain:

- lifecycle;
- payment state;
- deposit state;
- immutable Order line snapshots;
- integer money handling;
- lead time;
- capacity calendar;
- requested-date truth;
- over-capacity rejection;
- reservation release;
- Order → Booking delegation;
- opaque tracking token;
- public projection;
- idempotency;
- shop-scoped runtime ports.

### KMO boundary

Never import BK01 generic capacity as authority over KMO.

KMO retains:

```text
public.production_allocations
KMO production capacity
custom fabrication reality
multi-day work
actual ready-date/workshop load
```

Future integration direction:

```text
BK01 Order domain model
        +
KMO production-capacity authority
```

Never:

```text
BK01 generic capacity
        ↓
replace KMO production truth
```

## 8. Already present in KMO — do not duplicate as implementation

The following were verified byte-identical between KMO and BK01 at reconciliation time.

Record them in `ALREADY_PRESENT.md`.

### Customer self-management

```text
apps/booking-consumer/src/app/manage-booking/page.tsx
blob 09dcfa5a43cfadaddf589f8d2f6d85fe06266617
```

### Private deposit-slip upload

```text
apps/booking-consumer/src/app/api/deposit-slips/upload-intent/route.ts
blob d764bb6e24900fdc12220d0b6fb523b5975c276d
```

### Notification retry policy

```text
apps/booking-consumer/src/lib/notification-policy.ts
blob 4d86505b6cf6bdefc574a534e743eac73e925025
```

### Notification tests

```text
tests/notification-policy.test.ts
blob fa159d77ce9c968d5814a96259c1c47da07f0a3b
```

KMO already carries:

- customer cancel/reschedule;
- recovery-token booking management;
- private signed slip upload;
- capped provider retries;
- exponential retry;
- cancelled reminder suppression;
- notification failure separated from Booking truth.

No new implementation card is required unless later verification proves drift.

## 9. Preserve R4 proof methodology

Copy or reference useful lightweight evidence from:

```text
docs/audit/r4-2026-09-23/
```

At minimum preserve:

```text
REPORT-BK01-R4-CLOSURE-2026-09-23.md
EVIDENCE-INDEX-2026-09-23.json
```

Preserve enough text/JSON procedure to understand or reproduce:

- truthful-state matrix;
- authenticated Admin matrix;
- desktop/mobile proof;
- positive Booking E2E;
- cross-tenant isolation;
- rapid tenant navigation;
- fixture cleanup / residue zero;
- real KMO data fingerprint before/after;
- external side-effect suppression.

Do not import large screenshots, binaries, generated build output, or caches unless strictly required. Record the upstream path for intentionally omitted evidence.

## 10. MANIFEST requirements

`MANIFEST.md` must contain one row per imported or inventory-only item:

```text
Category
Upstream repo
Upstream ref
Upstream path
Upstream blob SHA
Local reference path
Import mode
Intended future KMO use
Current authorization
Notes
```

Valid import modes:

```text
EXACT_COPY
REFERENCE_DOC
ALREADY_PRESENT_IDENTICAL
INVENTORY_ONLY
```

Every copied source file must trace to an exact upstream commit and blob. Never use `latest`.

## 11. IMPORT_MAP requirements

For each concept classify future intent as one of:

```text
ADAPT_FOR_KMO
REFERENCE_ONLY
ALREADY_PRESENT
PRESERVE_KMO_OVER_UPSTREAM
FUTURE_AUTHORIZATION_REQUIRED
```

At minimum:

```text
Public Portal                    → ADAPT_FOR_KMO
Booking state resolver           → ADAPT_FOR_KMO
Load-result truth                → ADAPT_FOR_KMO
Payment instruction              → ADAPT_FOR_KMO
Admin readiness                  → ADAPT_FOR_KMO
Schedule dirty UX                → ADAPT_FOR_KMO
Claim UI/contract                → FUTURE_AUTHORIZATION_REQUIRED
Order core/scaffold              → FUTURE_AUTHORIZATION_REQUIRED
KMO weekly schedule              → PRESERVE_KMO_OVER_UPSTREAM
KMO production capacity          → PRESERVE_KMO_OVER_UPSTREAM
KMO identity/bridge              → PRESERVE_KMO_OVER_UPSTREAM
```

## 12. Strict prohibitions

This task must not:

- modify canonical `Gutumrod/booking`;
- merge BK01 branches into KMO;
- cherry-pick BK01 implementation commits into active KMO runtime;
- copy files directly into active `bk01-pilot/apps/**`;
- copy files directly into active `bk01-pilot/supabase/**`;
- copy files directly into active `bk01-pilot/order/**`;
- copy files directly into active `bk01-pilot/tests/**`;
- add or apply migrations;
- mutate KMO database/runtime;
- deploy;
- modify Cloudflare/Supabase/secrets/env;
- activate Public Portal;
- activate Order;
- activate Claim;
- modify KMO Control;
- replace KMO weekly schedule;
- replace KMO production capacity;
- replace KMO identity/bridge;
- create a universal customer identity;
- change existing Booking behavior;
- claim copied reference source is implemented.

Never copy:

```text
node_modules
.next
.open-next
.wrangler
build output
.env*
credentials
tokens
temporary runtime files
dependency caches
```

## 13. Verification before commit

Required:

1. `git diff --check`
2. changed paths limited to:

```text
bk01-pilot/reference/bk01-upstream-seed-2026-09-24/**
bk01-pilot/docs/**
```

3. zero changes under active:

```text
bk01-pilot/apps/**
bk01-pilot/supabase/**
bk01-pilot/order/**
bk01-pilot/tests/**
```

4. exact-copy blobs verified against pinned upstream refs;
5. no secrets/env files;
6. no executable runtime registration;
7. no route/build/config/package changes.

## 14. Documentation pointer

Update KMO documentation index with one pointer stating:

> BK01 upstream seed pack is reference/provenance material only. Presence in the repository does not mean the capability is implemented, authorized, deployed, or active.

Do not change Domain authorization.

## 15. Commit / push

Preferred commit:

```text
chore(kmo): stage BK01 upstream reference seed pack
```

Push only:

```text
prep/kmo-bk01-upstream-seed-20260924
```

Do not merge automatically.

## 16. Reviewer contract

After worker completion, Codex performs bounded read-only verification.

Verify:

- exact provenance;
- files came from stated BK01 revisions;
- no active KMO runtime source changed;
- no route became active;
- no migration/schema/runtime mutation exists;
- no Order/Claim implementation was accidentally introduced;
- already-present identical files were not unnecessarily forked;
- KMO-specific contracts were not overwritten;
- manifest/import map are complete.

Allowed verdicts:

```text
SEED_PACK_PASS
SEED_PACK_REMEDIATE
```

Codex must not implement fixes.

## 17. Completion marker

Successful result:

```text
KMO_BK01_UPSTREAM_SEED_PACK = READY
```

Meaning only:

> BK01 reusable source/design/evidence has been safely staged inside KMO with exact provenance and is ready for future selective adaptation.

It does not mean:

```text
Booking changes implemented
Order implemented
Claim implemented
Public Portal live
Database changed
Production changed
```

Stop after commit + push + verification.

Do not resume D1A automatically from this task.
