# UPSTREAM DEFECT — BK01 PromptPay fake recipient fallback

Date: 2026-09-08
Scope: generic BK01 defect discovered during KMO dark-pilot validation
Severity: HIGH before customer payment cutover

## Evidence

Canonical BK01 inspected read-only at:
`D:\AI-Workspace\projects\saas-product-hub\products\booking`

Canonical HEAD at discovery:
`c0b90195c2f0bdedd22a75543deb826c46ce0216`

Both canonical and the KMO controlled copy contained this behavior in the consumer booking page:

```ts
const promptpayNumber = shop?.promptpay_number || '0812345678';
```

If the merchant had no PromptPay recipient configured, the UI could generate a valid-looking dynamic PromptPay QR for the example number instead of failing closed.

## Risk

- payment can be directed to an unintended recipient;
- the QR still looks technically valid to the customer;
- the defect is triggered specifically when merchant payment configuration is missing, which is a realistic onboarding state;
- creating a booking hold before detecting the missing payment method consumes a live time slot unnecessarily.

## KMO mitigation

KMO pilot is fail-closed:
- no example PromptPay recipient fallback;
- dynamic QR only when a real merchant recipient exists;
- optional KMO-only static QR image requires explicit `NEXT_PUBLIC_KMO_STATIC_PROMPTPAY_QR_URL` opt-in;
- if neither payment method exists and deposit is required, booking hold creation is blocked;
- no static QR is configured yet, so KMO remains payment-cutover blocked.

## Upstream requirement

Fix must be applied and reviewed in canonical BK01 through the WSTERA workflow, then released/synced back to KMO. The KMO mitigation is deployment safety evidence and must not be treated as silent canonical remediation.
