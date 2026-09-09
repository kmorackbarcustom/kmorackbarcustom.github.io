# UPSTREAM DEFECT — BK01 Shop Settings Coupled to PromptPay

**Date:** 2026-09-09
**Classification:** GENERIC BK01 DEFECT / CONTRACT COUPLING
**KMO action:** document only; do not silently fork-fix in KMO

## Reproduction
During KMO M3/B1 live-database verification, authenticated Owner-role execution of `local_service.update_shop_settings(...)` failed because the KMO dark-deploy tenant intentionally has no PromptPay identity configured yet.

The function requires all of these in the same write:
- shop name
- shop phone
- PromptPay number
- PromptPay account name

Observed first error on the current KMO tenant was `Shop phone is required`. Source inspection then confirmed that after phone is supplied the same RPC also rejects blank PromptPay number and blank PromptPay account name.

## Why this is generic
The same validation exists in canonical BK01 at:
`supabase/migrations/20260807191046_phase_e3_3_shop_settings_authorization.sql`

Canonical validation requires non-empty `p_phone`, `p_promptpay_number`, and `p_promptpay_name` before any settings update can persist.
## Contract conflict
KMO roadmap M3 requires `Shop Settings read/write` before M5 Payment / Deposit Closure.
KMO payment contract intentionally forbids inventing a PromptPay recipient and keeps payment fail-closed until a verified supported identity or approved static QR exists.

Therefore the current generic RPC makes a non-payment settings write impossible before payment onboarding is complete.

## Impact
- Progressive onboarding cannot save shop profile/contact independently of payment setup.
- A merchant with payment temporarily unset cannot update unrelated shop profile fields.
- KMO M3 cannot close without either violating the payment safety gate or changing the settings contract.
- Filling demo/fake PromptPay values is explicitly prohibited and is not an acceptable workaround.

## Recommended upstream remediation
Decouple operational shop profile from payment configuration.
Preferred contract: separate profile/contact update from payment-method update, or make PromptPay fields nullable in the profile write while preserving a separate booking/payment acceptance gate.

The safety invariant must remain unchanged: deposit-required booking must fail closed when no verified payment method is configured.
