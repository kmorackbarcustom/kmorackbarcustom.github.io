# KMO Payment Flow — BK01 Pilot

## Decision

KMO does not use Stripe for this pilot.
BK01 merchant billing is not part of the KMO runtime.
KMO is a WSTERA design-partner entitlement and the booking entitlement row remains only as a booking gate.

## Current KMO payment behavior

The legacy KMO booking page uses a static payment image, a fixed deposit amount, and asks the customer to send the slip through LINE after receiving a job code.
KMO LINE image handling can recognize likely payment-proof images and notify staff in Telegram, but that signal is not bank settlement truth and must not automatically mark a payment verified.

## BK01 capability confirmed

BK01 generates PromptPay payloads locally; it does not require promptpay.io at runtime.
The payload includes the requested amount, so each booking deposit can render a QR for the exact deposit value.
Supported recipients in the current generator are:
- Thai mobile PromptPay alias: 10 digits beginning with 0
- 13-digit PromptPay identifier

The KMO legacy value currently displayed as PromptPay has a bank-account-like format and must not be fed into this generator without a confirmed PromptPay alias.

## Pilot booking-deposit flow

1. Customer selects KMO service/date/time.
2. BK01 creates a collision-safe booking hold.
3. Deposit amount resolves from the service, with shop default only as fallback.
4. BK01 generates an amount-specific PromptPay QR from the confirmed KMO PromptPay alias.
5. Customer transfers the deposit and uploads a slip in BK01.
6. Booking becomes pending review; the slip is stored privately.
7. KMO staff receives an operational notification and verifies the payment.
8. Only verified payment moves the booking to confirmed.
9. LINE/Telegram are notification channels, not payment state authorities.

## KMO customer billing beyond booking

Do not expand BK01 booking tables into a full shop accounting system.
For balances, accessories, fabrication jobs, or final payment, add a separate KMO-owned `payment_requests` capability later, linked to a job/order.
Minimum model should contain: payment request ID, job/order reference, customer, requested amount, paid amount, status, PromptPay recipient reference, slip object path, verification state, timestamps, and audit actor.

That capability can reuse the same PromptPay payload generator to produce an exact-amount QR and can reuse the existing KMO Telegram alert path for staff review.
Automatic settlement must wait for a trusted verification provider or bank/payment API; AI/vision classification alone is not sufficient payment confirmation.
