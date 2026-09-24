// KMO post-hold payment instruction gate.
//
// Adapted for KMO from the read-only BK01 R4 seed
// `booking-r4/consumer/src/lib/payment-instruction.ts` (brief section 9 /
// Amendment B1, and Codex R4 review F1-F2, R2-1).
//
// The KMO booking page currently invents all three of the values a deposit
// payment control needs:
//   - the amount: the selected service's deposit, else the shop default deposit,
//     else a hard-coded literal deposit
//   - the account holder: the configured name OR the shop name OR a translated
//     fallback name
//   - the countdown: an independent hard-coded fifteen-minute constant
// This module is the single honest owner of all three, so no caller has to
// guess and no payment control can be rendered from invented data.
//
// A payable deposit instruction is returned ONLY when the whole tuple is
// verified:
//   - a configured PromptPay recipient that passes the PromptPay format
//     contract (10-digit mobile starting with 0, or 13-digit national/tax ID)
//     -- a non-empty string is NOT enough,
//   - a configured non-empty account-holder name -- NEVER derived from the shop
//     name or any fallback,
//   - a server-authoritative deposit amount that is finite and strictly
//     positive (the hold row's amount, `holdResult.deposit_amount`; a pre-hold
//     value, a shop default or any literal is never authoritative),
//   - a PromptPay QR payload that actually encodes from the above.
// If any part is missing or invalid the instruction fails closed: `payload`
// null, and no usable amount, recipient or name for a caller to render.
//
// KMO keeps its optional reusable STATIC PromptPay QR fallback, but only as a
// provenance-gated image path (`resolveStaticQrInstruction`): usable=true only
// when the caller explicitly supplies a non-empty trimmed URL. The static
// result deliberately carries no amount and no account identity, so it can
// never be used to justify either.
//
// `remainingHoldSeconds` is the single owner of the hold countdown: it converts
// a server-provided `expires_at` into remaining whole seconds and returns null
// (never a literal) when that value is missing or unparseable, so no caller
// needs an independent 900-second constant.
//
// The PromptPay EMVCo encoder lives in this file (not a sibling module) so the
// recipient format contract has exactly one owner shared by this gate and this
// module's QR payload. This module is deliberately import-free: the existing
// KMO PromptPay encoder/CRC module is left untouched and is never a dependency
// of this module, which also keeps it framework-free and unit-testable straight
// from `tests/`.
//
// Pure and framework-free for unit testing from `tests/`.

// --- PromptPay EMVCo payload ---

type PromptPayPayloadInput = {
  recipient: string;
  amount: number;
};

/**
 * Upper bound of the EMVCo transaction-amount field (12 integer digits) --
 * a format bound on the payload, NOT a default amount. No caller ever receives
 * this value as an amount.
 */
const EMVCO_MAX_AMOUNT = 999999999.99;

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function normalizeRecipient(recipient: string): { tag: '01' | '02'; value: string } | null {
  const digits = recipient.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) {
    return { tag: '01', value: `0066${digits.slice(1)}` };
  }
  if (/^\d{13}$/.test(digits)) {
    return { tag: '02', value: digits };
  }
  return null;
}

/** The PromptPay recipient format contract (mobile starting with 0, or 13-digit ID). */
export function isValidPromptPayRecipient(recipient: string | null | undefined): boolean {
  return typeof recipient === 'string' && normalizeRecipient(recipient) !== null;
}

export function crc16CcittFalse(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function createPromptPayPayload({ recipient, amount }: PromptPayPayloadInput): string {
  if (!Number.isFinite(amount) || amount <= 0 || amount > EMVCO_MAX_AMOUNT) {
    throw new Error('Invalid PromptPay amount');
  }

  const target = normalizeRecipient(recipient);
  if (!target) throw new Error('Invalid PromptPay recipient');
  const merchantAccount = tlv('00', 'A000000677010111') + tlv(target.tag, target.value);
  const body = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('29', merchantAccount),
    tlv('53', '764'),
    tlv('54', amount.toFixed(2)),
    tlv('58', 'TH'),
  ].join('');
  const withCrcTag = `${body}6304`;
  return `${withCrcTag}${crc16CcittFalse(withCrcTag)}`;
}

// --- post-hold instruction gate ---

export interface PaymentInstructionInput {
  /** The shop's configured PromptPay recipient ("promptpay_number"). */
  promptpayNumber: string | null | undefined;
  /** The shop's configured PromptPay account name ("promptpay_name") only -- never a derived or fallback name. */
  promptpayName: string | null | undefined;
  /**
   * The hold row's amount (`holdResult.deposit_amount`) -- the only
   * server-authoritative deposit amount. A pre-hold, service, shop-default or
   * literal value is not authoritative and must not be passed here. Only a real
   * number counts; nothing is parsed or coerced from a string.
   */
  holdDepositAmount: number | null | undefined;
}

// Discriminated union: `ok: true` narrows number/name/amount/payload to
// non-null, so callers cannot render a payment control without a complete,
// valid tuple and an encodable QR. Every not-ok variant reports `payload: null`
// and null amount/recipient/name.
export type PaymentInstruction =
  | { ok: true; number: string; name: string; amount: number; payload: string }
  | { ok: false; number: string | null; name: string | null; amount: null; payload: null };

function cleanString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The authoritative hold amount is a finite number strictly greater than zero.
 * Anything else -- absent, NaN, Infinity, zero, negative -- is not an amount and
 * yields null. No default, shop default or literal is substituted.
 */
export function authoritativeDepositAmount(
  holdDepositAmount: number | null | undefined,
): number | null {
  return typeof holdDepositAmount === 'number'
    && Number.isFinite(holdDepositAmount)
    && holdDepositAmount > 0
      ? holdDepositAmount
      : null;
}

/** Configured recipient passes the format contract AND a configured account name exists. */
export function isPromptPayIdentityComplete(
  promptpayNumber: string | null | undefined,
  promptpayName: string | null | undefined,
): boolean {
  const number = cleanString(promptpayNumber);
  return number !== null && isValidPromptPayRecipient(number) && cleanString(promptpayName) !== null;
}

/**
 * The only payable gate: an instruction is `ok` only when the recipient passes
 * the format contract, a configured account-holder name exists, a positive
 * authoritative hold amount exists, and the QR payload actually encodes.
 * Otherwise it fails closed with `payload: null`.
 */
export function resolvePaymentInstruction(input: PaymentInstructionInput): PaymentInstruction {
  const rawNumber = cleanString(input.promptpayNumber);
  const number = rawNumber !== null && isValidPromptPayRecipient(rawNumber) ? rawNumber : null;
  const name = cleanString(input.promptpayName);
  const amount = authoritativeDepositAmount(input.holdDepositAmount);
  if (number !== null && name !== null && amount !== null) {
    try {
      return {
        ok: true,
        number,
        name,
        amount,
        payload: createPromptPayPayload({ recipient: number, amount }),
      };
    } catch {
      // e.g. amount above the EMVCo field limit: NOT a payable instruction, so
      // the amount is withheld too rather than reported as payable data.
    }
  }
  return { ok: false, number, name, amount: null, payload: null };
}

// --- optional KMO static PromptPay QR fallback ---

export interface StaticQrInstructionInput {
  /**
   * The static QR image URL the caller explicitly supplies (KMO deployment
   * configuration). Provenance is what makes it usable: this module never
   * discovers, derives or defaults a URL, and never reads an amount or an
   * account name out of it.
   */
  staticQrUrl: string | null | undefined;
}

// The static result carries ONLY the provenance-verified URL: no amount and no
// account identity, so nothing here can justify either.
export type StaticQrInstruction =
  | { usable: true; url: string }
  | { usable: false; url: null };

/**
 * Provenance-gated static-QR path: usable=true ONLY when a non-empty trimmed
 * URL was explicitly supplied by the caller; usable=false otherwise. This gate
 * is about the image source alone -- it never authorises an amount or an
 * account-holder name, which stay owned by `resolvePaymentInstruction`.
 */
export function resolveStaticQrInstruction(input: StaticQrInstructionInput): StaticQrInstruction {
  const url = cleanString(input.staticQrUrl);
  return url !== null ? { usable: true, url } : { usable: false, url: null };
}

// --- authoritative hold expiry ---

/**
 * Remaining whole seconds of a hold, derived only from the server-provided
 * `expires_at` (e.g. `holdResult.expires_at`). Returns null -- never a literal
 * -- when `expires_at` is missing, blank or unparseable, so a caller must
 * decide what to do instead of inheriting a made-up countdown. An already
 * elapsed hold returns 0.
 *
 * @param now current time, injectable for deterministic tests (default: now)
 */
export function remainingHoldSeconds(
  expiresAt: string | null | undefined,
  now: number | Date = Date.now(),
): number | null {
  if (typeof expiresAt !== 'string') return null;
  const trimmed = expiresAt.trim();
  if (trimmed === '') return null;
  const expiresAtMs = Date.parse(trimmed);
  if (!Number.isFinite(expiresAtMs)) return null;
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return null;
  const remainingMs = expiresAtMs - nowMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
