# ALREADY_PRESENT — BK01 files already byte-identical in KMO

These were **not** copied into the seed pack. KMO already carries them at the active paths below; forking a second copy would create drift risk.

Re-verified 2026-09-24: KMO blob at base `058fe5211c9eb39d7dda3087ec40b1e896227113` == BK01 blob at R4 `3b3a3338de029a058aa5763c806be42f8a5205ca`.

| Capability | KMO active path (under `bk01-pilot/`) | BK01 path | Blob (both sides) |
|---|---|---|---|
| Customer self-management | `apps/booking-consumer/src/app/manage-booking/page.tsx` | same | `09dcfa5a43cfadaddf589f8d2f6d85fe06266617` |
| Private deposit-slip upload | `apps/booking-consumer/src/app/api/deposit-slips/upload-intent/route.ts` | same | `d764bb6e24900fdc12220d0b6fb523b5975c276d` |
| Notification retry policy | `apps/booking-consumer/src/lib/notification-policy.ts` | same | `4d86505b6cf6bdefc574a534e743eac73e925025` |
| Notification tests | `tests/notification-policy.test.ts` | same | `fa159d77ce9c968d5814a96259c1c47da07f0a3b` |

KMO already carries: customer cancel/reschedule; recovery-token booking management; private signed slip upload; capped provider retries; exponential retry; cancelled-reminder suppression; notification failure separated from Booking truth.

No new implementation card is required unless later verification proves drift. Drift check:

```bash
git rev-parse HEAD:bk01-pilot/<path>   # compare with blob column
```
