# BK01 Documentation Index & Authority Order

**Status:** LOCKED — 2026-08-28

## Authority order
When documents disagree, use this order:
1. dated explicit owner decisions in `PRODUCT_DECISIONS.md` and accepted ADRs;
2. numbered current SSOT `00_PRODUCT_VISION.md` through `10_DEVELOPMENT_ROADMAP.md`;
3. `audit/FEATURE_REQUIREMENT_TRACEABILITY.md` for feature disposition/mapping;
4. current operations/marketing packs, which must derive from numbered SSOT;
5. current market/audit evidence;
6. implementation code/migrations as evidence of **current baseline behavior**, not permission to override approved target product intent;
7. historical phase reports, handoffs, briefs and superseded specifications.

A contradiction between target SSOT and current implementation is a BK-A gap, not a reason to silently rewrite the product contract.

## Current SSOT
- `00_PRODUCT_VISION.md` — problem/ICP/category/principles/non-goals
- `01_PRD.md` — stable V1 requirements
- `02_SYSTEM_ARCHITECTURE.md` — runtime/data/failure boundaries
- `03_DATA_SECURITY_TENANCY.md` — identity/RLS/storage/data lifecycle
- `04_PRICING_ENTITLEMENTS.md` — packaging/billing/entitlement contract
- `05_BOOKING_DOMAIN_RULES.md` — lifecycle and scheduling invariants
- `06_UX_USER_FLOWS.md` — role journeys/recovery states
- `07_ANALYTICS_KPI_SPEC.md` — canonical events and KPI definitions
- `08_EXTERNAL_DEPENDENCIES.md` — provider boundaries
- `09_TEST_RELEASE_GATES.md` — release evidence contract
- `10_DEVELOPMENT_ROADMAP.md` — BK-A onward build order

## Evidence and governance
- `PRODUCT_DECISIONS.md` — owner-approved product decisions
- `ADR_TEMPLATE.md` — future architecture/security decision format
- `MASTER_CHECKLIST.md` — BK-0/BK-A/launch readiness checklist
- `audit/CURRENT_TRUTH_AND_CONTRADICTIONS.md` — baseline conflicts/disposition
- `audit/FEATURE_REQUIREMENT_TRACEABILITY.md` — complete feature mapping
- `audit/MARKET_SOURCE_LEDGER.md` — sourced changing-market facts
- `audit/DOCUMENTATION_AUDIT.md` — final cross-document review record
- `../UPSTREAM.md` — canonical BK01/KMO boundary and bidirectional upstream/downstream sync rule
- `BK01_UPSTREAM_FEEDBACK_LEDGER.md` — defect/improvement/sync ledger and upstream disposition record
- `REPORT-BK01-R4-UPSTREAM-FAST-FORWARD-2026-09-23.md` — Owner-issued upstream evidence packet for reconciling canonical BK01 R4 CLOSED into KMO before D1A without erasing KMO-specific operational truth
- `REPORT-KMO-D0.5-BK01-R4-RECONCILIATION-2026-09-23.md` — completed KMO-vs-BK01 R4 classification matrix and D0.5 promotion decision
- `BRIEF-KMO-D1A-POST-R4-RECONCILIATION-2026-09-23.md` — current D1A authority after upstream reconciliation and KMO-first Booking direction
- `REPORT-KMO-BOOKING-LEGACY-EXTRACTION-DIRECTION-2026-09-23.md` — current KMO-first Booking direction: public intake capacity locks only the appointment date; long-running work stays in the operational lifecycle until explicit completion; canonical BK01 remains frozen pending KMO proof
- `../reference/bk01-upstream-seed-2026-09-24/README.md` — BK01 upstream seed pack is reference/provenance material only. Codex independent review returned `SEED_PACK_PASS`; marker `KMO_BK01_UPSTREAM_SEED_PACK = READY` means ready for future selective adaptation only, not implemented/authorized/deployed/active. (Brief: `BRIEF-KMO-BK01-UPSTREAM-SEED-PACK-2026-09-24.md`; review: `REPORT-CODEX-KMO-BK01-UPSTREAM-SEED-PACK-REVIEW-2026-09-24.md`)
- `BRIEF-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md` — next-chat read/classify/adoption-planning brief: decide use/adapt/reject/defer for the full Seed Pack and, when coherent, produce one coordinated KMO one-shot integration plan without modifying active implementation
- `REPORT-KMO-BK01-SEED-PACK-ADOPTION-ASSESSMENT-2026-09-24.md` — full Seed Pack adoption decision set vs active KMO @ `058fe52`; findings F-1..F-4; open Owner decisions OD-1..OD-3. Codex review R1 `REMEDIATE` → R2 → R3 `ADOPTION_PLAN_PASS` (`REPORT-CODEX-KMO-BK01-SEED-PACK-ADOPTION-REVIEW{,-R2,-R3}-2026-09-24.md`). Marker: `KMO_BK01_SEED_PACK_ADOPTION_DECISION = LOCKED`
- `PLAN-KMO-BK01-ONE-SHOT-INTEGRATION-2026-09-24.md` — reviewed historical one-shot plan. Independent verification found execution-readiness gaps (OD-3 misclassified, KMO intake data placement not locked, Booking work-state authority boundary underspecified, Portal unnecessary for D1, stale workflow pins). Do not dispatch this file by itself.
- `REPORT-SOL-KMO-BK01-SEED-ADOPTION-INDEPENDENT-VERIFICATION-2026-09-24.md` — independent source/contract/workflow verification at prep HEAD `30c7e44`; marker `KMO_BK01_INDEPENDENT_VERIFICATION = PASS_WITH_CORRECTED_LONG_RUN_REQUIRED`.
- `PLAN-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md` — corrected D1A execution plan: Portal/Order/Claim parked, `public.orders` / `public.production_allocations` protected, KMO intake/work state confined to `kmo_booking.*`, fresh current workflow pins.
- `RUN-MANIFEST-KMO-DOMAIN-BOOKING-READINESS-001-LONG-RUN-2026-09-24.md` + `BRIEF-KMO-BK01-D1A-LONG-RUN-EXECUTION-2026-09-24.md` — prepared LONG_RUN execution contract. DRAFT until Owner forwards the paired brief; forwarding is the approval event for source execution only, never production mutation.
- `market/*` — market/competitor/ICP evidence as dated analysis, not timeless product truth

## Marketing and operations
`marketing/*` and `operations/*` are current derived contracts. They cannot override numbered SSOT or owner decisions. `marketing/KPI_METRICS.md` imports KPI definitions from `07_ANALYTICS_KPI_SPEC.md`.

## Historical / non-authoritative inputs
The following remain useful evidence but are superseded as current product specification: root `PRODUCT_RULES_V1.md`, root `PROJECT_HANDOVER_BRIEF.md`, `docs/business/OFFICIAL_BUSINESS_MODEL.md`, `docs/business/PRICING_SPEC.md`, old Phase E/Launch briefs/reports and other dated completion/handover files. `README.md` is repository orientation only unless updated to point here.

Historical documents may describe behavior that was true at a prior commit/environment. Their labels such as “official”, “complete” or “100%” do not override this index.

## Conflict/change rule
1. record evidence/contradiction;
2. if product/business choice, update `PRODUCT_DECISIONS.md` with owner approval;
3. if architecture/security trade-off, add ADR;
4. update every affected SSOT/traceability/marketing/operations document in the same change;
5. rerun documentation audit before merge.

No implementation phase may introduce a new externally visible entitlement, role capability, money state or privacy boundary without documentation/traceability change first.
