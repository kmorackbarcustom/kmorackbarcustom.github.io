# BK01 Upstream Sync Manifest — 2026-09-08

Canonical source:
- Repo path: `D:\AI-Workspace\projects\saas-product-hub\products\booking`
- Branch: `feature/bk-a-v1-contract-remediation`
- Snapshot commit: `4a694bcf1cd7c167c12036e89f999e04b969f7b9`
- Previous KMO import ref: `82b297df2d42156e750794ac4135852450570264`

Snapshot target:
- `bk01-pilot/upstream-reference/bk01-4a694bc/`
- Files: 270
- Uncompressed bytes: 2,253,884

Comparison against active KMO tree before this snapshot:
- canonical files: 270
- absent from active KMO tree: 137
- byte-identical: 14
- present but divergent: 119

The snapshot is reference-only and must not be deployed directly.## Important findings

Canonical BK01 at this ref still does **not** contain an implemented KMO-style Order runtime inside the Booking dashboard.

It does contain Order design/contract artifacts under `docs/order/`:
- `00_PRODUCT_BOUNDARY_DECISION_2026-09-05.md`
- `01_ORDER_V1_CONTRACT.md`
- `02_MODULE_REUSE_CHECK.md`
- `03_MT01_BOOTSTRAP_CHECK.md`
- `04_PHASE0_HANDOFF.md`

Canonical BK01 also does **not** contain the KMO Claim / CM01 implementation. Ticket/support surfaces present in BK01 are not equivalent to KMO Claim & Case Management.

Post-import canonical work from `82b297d..4a694bc` mainly covers:
- CONT-04 runtime defect fixes
- staging/shared-runtime migration tooling and evidence
- overdue LINE reminder suppression
- shared-runtime schema/coexistence assessment
- canonical documentation updates
## Snapshot integrity

- Canonical archive SHA-256: `8e0ba26f78f4caff5419fa7c4355d3ab3f245442113b6816c5ba3052482e0df2`
- Snapshot file manifest: `SNAPSHOT-FILES.json`
- Active KMO comparison: `ACTIVE-COMPARISON.json`
- Token-shaped secret scan: **0 hits**

After copying the five canonical Order contract documents into active `bk01-pilot/docs/order/`, the comparison is:
- missing from active KMO: 132
- byte-identical: 108
- divergent: 30

Missing canonical runtime surfaces that conflict with KMO guardrails remain reference-only until explicitly reviewed; this includes Stripe billing/webhook, platform-admin, and generic ticket UI/runtime.