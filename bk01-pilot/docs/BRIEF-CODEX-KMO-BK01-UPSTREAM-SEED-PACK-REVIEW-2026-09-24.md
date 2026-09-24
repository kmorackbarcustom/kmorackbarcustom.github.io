# BRIEF — CODEX INDEPENDENT REVIEW: KMO BK01 UPSTREAM SEED PACK

Date: 2026-09-24 (Asia/Bangkok)
Program: KMO RACKBARCUSTOM
Review mode: `READ-ONLY / INDEPENDENT VERIFICATION`
Reviewer: Codex
Target branch: `prep/kmo-bk01-upstream-seed-20260924`
Seed Pack target revision: `73d7651ab302f84d80859d743768b3f13efbf608`

## Governing brief

Read first:

`bk01-pilot/docs/BRIEF-KMO-BK01-UPSTREAM-SEED-PACK-2026-09-24.md`

Then inspect:

`bk01-pilot/reference/bk01-upstream-seed-2026-09-24/`

including:

- `README.md`
- `MANIFEST.md`
- `IMPORT_MAP.md`
- `ALREADY_PRESENT.md`

This review brief may live in a docs-only follow-up commit after the Seed Pack target. The product/reference target under review remains exactly `73d7651ab302f84d80859d743768b3f13efbf608`.

## Objective

Determine whether the Seed Pack at the exact target revision satisfies the governing brief and remains a quarantined provenance/reference package with zero active KMO implementation effect.

Allowed verdicts only:

- `SEED_PACK_PASS`
- `SEED_PACK_REMEDIATE`

Do not declare `KMO_BK01_UPSTREAM_SEED_PACK = READY` yourself. Promotion happens only after the Codex verdict is received and recorded.

Do not modify files, commit, push, merge, remediate, deploy, or mutate runtime/database.

## 1. Git scope

Verify the exact changed paths that produced target `73d7651ab302f84d80859d743768b3f13efbf608`.

Confirm zero changes under active:

- `bk01-pilot/apps/**`
- `bk01-pilot/supabase/**`
- `bk01-pilot/order/**`
- `bk01-pilot/tests/**`

Confirm imported content is confined to:

`bk01-pilot/reference/bk01-upstream-seed-2026-09-24/**`

plus only the authorized documentation-index pointer.

Run/verify `git diff --check`.

## 2. Provenance

Pinned upstream refs:

- BK01 R4 source: `3b3a3338de029a058aa5763c806be42f8a5205ca`
- BK01 R4 closure: `50555c14d1c578caabc421dbad995c8f2b80709e`
- BK01 final docs: `5aea75856dcaa05dd5e03dd3247c18e301736059`
- Public Portal / Claim safe lane: `45fa3abf5a316dea622b005bfced1acf948cb8bc`
- Order safe scaffold: `982188170f6a80ce492723786ca1e21cc2435733`

For every `EXACT_COPY` and `REFERENCE_DOC` manifest entry, independently verify local committed content/blob identity against the stated upstream source.

Builder claims:

- 94 copied files match upstream
- 52 `EXACT_COPY`
- 42 `REFERENCE_DOC`
- 26 `INVENTORY_ONLY`
- 4 `ALREADY_PRESENT_IDENTICAL`

Prove or reject these claims independently.

## 3. Already-present identity

Independently verify these four non-duplicated KMO files remain equivalent to the stated upstream blobs:

- `apps/booking-consumer/src/app/manage-booking/page.tsx` — `09dcfa5a43cfadaddf589f8d2f6d85fe06266617`
- `apps/booking-consumer/src/app/api/deposit-slips/upload-intent/route.ts` — `d764bb6e24900fdc12220d0b6fb523b5975c276d`
- `apps/booking-consumer/src/lib/notification-policy.ts` — `4d86505b6cf6bdefc574a534e743eac73e925025`
- `tests/notification-policy.test.ts` — `fa159d77ce9c968d5814a96259c1c47da07f0a3b`

## 4. Quarantine / no build effect

Independently prove `bk01-pilot/reference/**` is outside every active:

- tsconfig include
- workspace/package graph
- test glob
- Vitest config
- Next build source root
- runtime import graph

No `.ts` or `.tsx` file inside the reference pack may become an active compilation/test/runtime input merely because it exists in the repository.

## 5. Pack-local .gitattributes

Builder added a pack-local `.gitattributes` containing:

`* -text`

Reason given: Windows `core.autocrlf=true` could rewrite line endings and destroy exact upstream blob identity.

Verify independently:

- scope is confined to the reference pack;
- it does not alter active KMO source behavior;
- it appropriately preserves exact imported bytes;
- it does not create an unintended repository-wide Git behavior change.

If broader than necessary or unsafe, return `SEED_PACK_REMEDIATE` with the exact bounded correction.

## 6. Omitted Order catalog config

Builder intentionally did not copy Order catalog:

- `package.json`
- `package-lock.json`
- `tsconfig*`
- `vitest.config*`

Verify:

- omission does not destroy provenance;
- upstream refs/blob hashes remain recorded in `MANIFEST.md`;
- copied Order source remains understandable as reference material;
- no dependency/workspace/build graph was activated.

## 7. Secret / privacy boundary

Independently scan committed Seed Pack content for:

- secrets
- tokens
- credentials
- env content
- private customer data
- unexpected PII

Builder reports real KMO shop phone `0625893189` inside evidence and states it is already public shop contact data.

Do not accept that statement without checking context. Identify any other real-person/customer information.

The KMO repository is public; unresolved sensitive material is a blocker.

## 8. Capability isolation

Prove the reference pack does not activate:

- Public Portal
- Claim
- Order
- new Booking behavior
- new DB schema
- new migration
- new route registration
- new runtime adapter

Copied `/shop/[slug]`, Claim routes, Order source, etc. must exist only under the quarantined reference tree and remain unreachable by active KMO applications.

## 9. KMO truth preservation

Confirm the Seed Pack does not supersede or overwrite:

- KMO shop weekly schedule
- KMO special-holiday rules
- KMO production capacity / `public.production_allocations`
- KMO custom / multi-day operational truth
- KMO identity / bridge
- KMO-owned infrastructure

Claim and Order must remain `FUTURE_AUTHORIZATION_REQUIRED`, not implemented.

## Required output

Return:

```text
Verdict:
SEED_PACK_PASS
or
SEED_PACK_REMEDIATE

Target SHA:
73d7651ab302f84d80859d743768b3f13efbf608

Changed-path audit:
...

Provenance verification:
...

Blob verification:
...

Build/workspace quarantine:
...

.gitattributes finding:
...

Order-config omission finding:
...

Secret/privacy scan:
...

Capability/runtime isolation:
...

KMO-contract preservation:
...

Findings:
- severity
- exact path/evidence
- required remediation, if any
```

If PASS, explicitly state:

`Seed Pack is a provenance/reference package only. No active KMO capability was enabled or changed.`

Stop after verdict.

Do not merge the branch.
Do not resume D1A.
Do not implement remediation yourself.
