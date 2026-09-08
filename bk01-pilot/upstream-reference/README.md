# BK01 Upstream Reference Lane

Purpose: preserve an exact, read-only copy of the BK01 canonical source used for KMO comparison and feedback.

Rules:
- `bk01-4a694bc/` is an immutable snapshot of canonical BK01 commit `4a694bcf1cd7c167c12036e89f999e04b969f7b9`.
- Do not run or deploy this snapshot directly from KMO.
- Do not edit files inside the snapshot to implement KMO behavior.
- KMO runtime changes stay in the normal `bk01-pilot/` tree.
- When KMO finds a generic defect or reusable improvement, compare against this snapshot and prepare evidence for BK01 upstream.
- A later upstream sync creates a new snapshot directory instead of rewriting this one.

This separation prevents KMO-specific Stripe-free, schema-isolation, and shop-specific changes from being mistaken for canonical BK01 behavior.