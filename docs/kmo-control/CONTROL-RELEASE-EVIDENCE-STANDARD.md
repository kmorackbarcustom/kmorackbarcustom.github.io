# CONTROL RELEASE EVIDENCE STANDARD — LOCKED / MANDATORY

Date: 2026-09-11
Status: LOCKED — MANDATORY GATE FOR CONTROL-TOUCHING DEPLOY / MIGRATION
Executor: Hermes Coordinator/Clerk (evidence collection and contract framing)
Decision authority: Risk/Invariant Council synthesis 2026-09-12; Owner closure authorization 2026-09-12
Enforcement: A Control-touching deploy/migration without complete evidence under this standard is not PASS/DONE and must fail release review.

## 1. Problem

Production `line-webhook` v47 source drifted from `origin/main` without a recorded decision or evidence trail. The drift was only discovered during Council evidence collection. Future Control-touching deploys must not repeat this pattern — every deploy must record verifiable evidence.

## 2. Scope

This standard applies to every deploy of a Supabase Edge Function or database migration that touches KMO Control surfaces:
- `line-webhook`
- `staff-reply`
- `internal-proxy`
- Any new Control-owned Edge Function
- Any migration affecting `public.line_messages`, `public.audit_logs`, `public.control_audit_logs`, or staff identity tables

Domain Operations deploys (BK01 / `local_service.*` / `kmo_booking.*`) are out of scope for this standard — they have their own release process.

## 3. Required evidence per deploy

Every Control-touching deploy must record the following in a release evidence document:

### 3.1 Function identity

| Field | Description | Example |
|---|---|---|
| `function_name` | Supabase Edge Function name | `line-webhook` |
| `production_version` | Supabase function version number after deploy | `48` |
| `deployed_at_utc` | Timestamp of deploy | `2026-09-12T10:30:00Z` |

### 3.2 Source provenance

| Field | Description | Example |
|---|---|---|
| `git_commit` | Git commit SHA deployed from | `4b2aac2960eb12ffcffc405a7d14ce281a09c786` |
| `git_branch` | Branch deployed from | `main` |
| `deployed_source_sha256` | SHA-256 of the deployed function source file | `dd6e5b508e4544b7ffe2cc4ba53c379677afc82c5dcb9b3b4305c47e4c1373b5` |
| `canonical_git_sha256` | SHA-256 of the same file at the declared Git commit | `dd6e5b508e4544b7ffe2cc4ba53c379677afc82c5dcb9b3b4305c47e4c1373b5` |
| `drift_detected` | Whether `deployed_source_sha256 != canonical_git_sha256` | `false` |

### 3.3 Drift decision

If `drift_detected = true`:
| Field | Description |
|---|---|
| `drift_direction` | `forward` (production ahead of Git) or `backward` (production behind Git) |
| `drift_reason` | Why production differs (e.g., "hotfix deployed via SQL editor", "import redirect to pinned commit") |
| `drift_resolution` | `forward-land` (merge production changes into Git), `redeploy` (overwrite production from Git), or `other` |
| `drift_decision_author` | Owner or authorized person who approved the drift resolution |
| `drift_decision_date` | When the drift resolution was authorized |

### 3.4 Deploy authorization

| Field | Description |
|---|---|
| `deploy_authorized_by` | Person who authorized this deploy |
| `deploy_authorized_at` | When deploy was authorized |
| `deploy_executed_by` | Person/tool that executed the deploy |
| `deploy_method` | `supabase-cli`, `github-actions`, `manual`, or other |

### 3.5 Verification evidence

| Field | Description |
|---|---|
| `post_deploy_version` | Confirmed production version after deploy (read back from Supabase API) |
| `post_deploy_source_sha256` | SHA-256 of source downloaded from production after deploy |
| `post_deploy_hash_matches_git` | Whether `post_deploy_source_sha256 == canonical_git_sha256` |
| `verification_timestamp_utc` | When verification was performed |
| `verification_method` | How verification was done (e.g., `supabase functions download + sha256sum`) |

## 4. Evidence storage

Release evidence documents are stored in the KMO repository under:
```
docs/release-evidence/<function-name>-v<version>-<date>.md
```

Example: `docs/release-evidence/line-webhook-v48-2026-09-12.md`

Each evidence document is committed to Git and tagged with the deploy commit SHA.

## 5. Pre-deploy checklist (must be all YES before deploy)

1. Is the Git source at the declared commit identical to what will be deployed? (hash comparison)
2. Has the source been reviewed by at least one person (not the deployer)?
3. Are all migrations in the deploy tracked in version-controlled `.sql` files?
4. Are no SQL Editor manual changes included in the deploy (unless explicitly authorized with a drift decision)?
5. Has the deploy been authorized by the Owner or a designated person?
6. Is the release evidence document template ready to be filled?

## 6. Post-deploy verification (must be all YES before release is considered complete)

1. Was the production function version confirmed via Supabase API?
2. Was the production source downloaded and hashed?
3. Does the production source hash match the Git source hash?
4. Was the release evidence document committed to Git?
5. If drift was detected, was a drift decision recorded?

## 7. Current state evidence (baseline)

As of 2026-09-11, the current state for reference:

| Function | Prod Version | Prod SHA-256 | Git SHA-256 | Drift? |
|---|---|---|---|---|
| `line-webhook` | 47 | `b27a1471...` | `dd6e5b50...` (origin/main) | YES — production is a 1-line import redirect to commit `2fcc46e` (ahead of origin/main by 2 commits) |
| `staff-reply` | 7 | `651128a8...` | `651128a8...` (origin/main) | NO — matches |

## 8. Import redirect pattern

The current `line-webhook` v47 uses a 1-line import redirect pattern:
```
import "https://raw.githubusercontent.com/kmorackbarcustom/kmorackbarcustom.github.io/<commit-sha>/supabase/functions/line-webhook/index.ts";
```

This pattern pins production to a specific Git commit's raw GitHub URL. If this pattern is used for future deploys:
- The `git_commit` field in the evidence document should be the pinned commit SHA (e.g., `2fcc46e...`), not `origin/main`.
- The `deployed_source_sha256` is the hash of the 1-line redirect file.
- The `canonical_git_sha256` is the hash of the actual source file at the pinned commit.
- `drift_detected` should be `false` if the redirect target is correctly recorded.
- However, this pattern means production may be ahead of `origin/main` — this should be recorded as `drift_direction: forward` relative to `origin/main` with a `drift_resolution: forward-land` plan.

**Recommendation**: Migrate away from the import redirect pattern to direct deploys from `origin/main` after the baseline reconciliation (Item 1) is resolved by the Owner.