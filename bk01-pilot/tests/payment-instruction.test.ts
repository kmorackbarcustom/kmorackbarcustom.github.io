import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  authoritativeDepositAmount,
  createPromptPayPayload,
  crc16CcittFalse,
  isPromptPayIdentityComplete,
  isValidPromptPayRecipient,
  remainingHoldSeconds,
  resolvePaymentInstruction,
  resolveStaticQrInstruction,
} from '../apps/booking-consumer/src/lib/payment-instruction.ts';

const complete = {
  promptpayNumber: '0812345678',
  promptpayName: 'Good Cuts Co Ltd',
  holdDepositAmount: 150,
};

// --- payable path: recipient + name + positive authoritative amount ---

test('complete tuple is ok and carries the encodable QR payload', () => {
  assert.deepEqual(resolvePaymentInstruction(complete), {
    ok: true,
    number: '0812345678',
    name: 'Good Cuts Co Ltd',
    amount: 150,
    payload: createPromptPayPayload({ recipient: '0812345678', amount: 150 }),
  });
});

test('13-digit ID and dashed mobile recipients are valid', () => {
  const id = resolvePaymentInstruction({ ...complete, promptpayNumber: '1234567890123' });
  assert.equal(id.ok, true);
  const dashed = resolvePaymentInstruction({ ...complete, promptpayNumber: '081-234-5678' });
  assert.equal(dashed.ok, true);
  if (dashed.ok) {
    assert.equal(crc16CcittFalse(dashed.payload.slice(0, -4)), dashed.payload.slice(-4));
  }
});

// R2-1: a non-empty string is not a PromptPay recipient.
test('malformed non-empty recipient fails closed with no usable number or payload', () => {
  for (const bad of ['not-a-number', '12345', '081234567', '08123456789', '1812345678', '123456789012', 'abc0812345678x9']) {
    assert.equal(isValidPromptPayRecipient(bad), false, `${bad} must be invalid`);
    const r = resolvePaymentInstruction({ ...complete, promptpayNumber: bad });
    assert.equal(r.ok, false, `${bad} must not be ok`);
    assert.equal(r.number, null);
    assert.equal(r.payload, null);
  }
});

test('ok is true only when the QR payload encodes -- every ok instruction is payable', () => {
  const numbers = [null, undefined, '', '  ', 'not-a-number', '0812345678', '1234567890123'];
  const names = [null, undefined, '', '   ', 'Shop Co'];
  const amounts = [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 150, 1_000_000_000];
  for (const promptpayNumber of numbers) for (const promptpayName of names) for (const holdDepositAmount of amounts) {
    const r = resolvePaymentInstruction({ promptpayNumber, promptpayName, holdDepositAmount });
    if (r.ok) {
      assert.equal(r.payload, createPromptPayPayload({ recipient: r.number, amount: r.amount }));
      assert.equal(isValidPromptPayRecipient(r.number), true);
      assert.ok(r.name.trim() !== '');
      assert.ok(Number.isFinite(r.amount) && r.amount > 0);
    } else {
      assert.equal(r.payload, null);
    }
  }
});

test('amount beyond the PromptPay field limit fails closed (no payload, not ok)', () => {
  const r = resolvePaymentInstruction({ ...complete, holdDepositAmount: 1_000_000_000 });
  assert.equal(r.ok, false);
  assert.equal(r.payload, null);
  assert.equal(r.amount, null);
});

test('identity is complete only with a format-valid number and a configured name', () => {
  assert.equal(isPromptPayIdentityComplete('0812345678', 'Shop Co'), true);
  assert.equal(isPromptPayIdentityComplete('not-a-number', 'Shop Co'), false);
  assert.equal(isPromptPayIdentityComplete('0812345678', '   '), false);
  assert.equal(isPromptPayIdentityComplete(null, 'Shop Co'), false);
});

test('missing number fails closed', () => {
  assert.equal(resolvePaymentInstruction({ ...complete, promptpayNumber: null }).ok, false);
  assert.equal(resolvePaymentInstruction({ ...complete, promptpayNumber: '   ' }).ok, false);
});

test('missing or blank account name fails closed (never derived)', () => {
  for (const bad of [null, undefined, '', '   ']) {
    const r = resolvePaymentInstruction({ ...complete, promptpayName: bad });
    assert.equal(r.ok, false, `name ${String(bad)} must not be ok`);
    assert.equal(r.name, null);
  }
});

// --- the invented-amount regression: no default is ever substituted ---

test('a missing hold amount fails closed instead of defaulting to a literal', () => {
  for (const bad of [null, undefined, 0, -50, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const r = resolvePaymentInstruction({ ...complete, holdDepositAmount: bad });
    assert.equal(r.ok, false, `amount ${String(bad)} must not be ok`);
    assert.equal(r.amount, null);
    assert.equal(r.payload, null);
  }
});

test('the module never substitutes a default amount of 100', () => {
  // the KMO page defect: deposit_amount ?? shop.default_deposit_amount ?? 100
  const r = resolvePaymentInstruction({ promptpayNumber: '0812345678', promptpayName: 'Shop Co' });
  assert.equal(r.ok, false);
  assert.equal(r.amount, null);
  assert.notEqual(r.amount, 100);
});

test('authoritativeDepositAmount accepts only a finite number > 0', () => {
  assert.equal(authoritativeDepositAmount(150), 150);
  assert.equal(authoritativeDepositAmount(0.5), 0.5);
  for (const bad of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(authoritativeDepositAmount(bad), null, `${String(bad)} must not be authoritative`);
  }
  // no string coercion: a numeric string is not an authoritative server amount
  assert.equal(authoritativeDepositAmount('150' as unknown as number), null);
});

test('an incomplete tuple never yields a usable amount or recipient for rendering', () => {
  const r = resolvePaymentInstruction({ promptpayNumber: '08', promptpayName: null, holdDepositAmount: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.name, null);
  assert.equal(r.amount, null);
  assert.equal(r.payload, null);
});

// --- optional static-QR fallback: provenance-gated ---

test('static QR is usable only for an explicitly supplied non-empty URL', () => {
  assert.deepEqual(resolveStaticQrInstruction({ staticQrUrl: 'https://cdn.example.com/kmo-qr.png' }), {
    usable: true,
    url: 'https://cdn.example.com/kmo-qr.png',
  });
  assert.deepEqual(resolveStaticQrInstruction({ staticQrUrl: '/kmo-qr.png' }), {
    usable: true,
    url: '/kmo-qr.png',
  });
  // trimmed provenance
  assert.deepEqual(resolveStaticQrInstruction({ staticQrUrl: '  https://cdn.example.com/kmo-qr.png  ' }), {
    usable: true,
    url: 'https://cdn.example.com/kmo-qr.png',
  });
});

test('static QR is not usable when the URL is absent or blank', () => {
  for (const bad of [null, undefined, '', '   ']) {
    const r = resolveStaticQrInstruction({ staticQrUrl: bad });
    assert.equal(r.usable, false, `${String(bad)} must not be usable`);
    assert.equal(r.url, null);
  }
});

test('the static-QR result carries no amount and no account identity', () => {
  const r = resolveStaticQrInstruction({ staticQrUrl: 'https://cdn.example.com/kmo-qr.png' });
  assert.deepEqual(Object.keys(r).sort(), ['url', 'usable']);
  assert.equal('amount' in r, false);
  assert.equal('name' in r, false);
});

// --- authoritative hold expiry: no independent 900-second constant ---

test('remainingHoldSeconds converts a server expires_at into whole seconds', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  assert.equal(remainingHoldSeconds('2026-09-24T12:15:00.000Z', now), 900);
  assert.equal(remainingHoldSeconds('2026-09-24T12:00:30.000Z', now), 30);
  // partial seconds round up so the shown countdown never disappears early
  assert.equal(remainingHoldSeconds('2026-09-24T12:00:00.400Z', now), 1);
  // an already elapsed hold is 0 (expired, distinct from unknown)
  assert.equal(remainingHoldSeconds('2026-09-24T11:59:00.000Z', now), 0);
  assert.equal(remainingHoldSeconds('2026-09-24T12:00:00.000Z', now), 0);
});

test('remainingHoldSeconds returns null (never a literal) when expires_at is absent or unparseable', () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  for (const bad of [null, undefined, '', '   ', 'not-a-date', '2026-13-45T99:99:99Z']) {
    assert.equal(remainingHoldSeconds(bad, now), null, `${String(bad)} must be null`);
  }
});

// --- source-level guarantees ---

const sourceUrl = new URL('../apps/booking-consumer/src/lib/payment-instruction.ts', import.meta.url);

test('the module is framework, network and database free', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /\bfrom\s+['"]/);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /react|next\//i);
});

test('no invented literal default amount is baked into the module', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // the only "100" allowed is inside a legitimate format constant / TLV tag,
  // never a bare default amount
  assert.doesNotMatch(source, /\?\?\s*100\b/);
  assert.doesNotMatch(source, /\bdefault\w*\s*(?:amount)?\s*[:=]\s*100\b/i);
  assert.doesNotMatch(source, /\bsetTimeLeft\s*\(\s*900\b/);
});

test('the module never derives the account-holder name from a shop name or a fallback', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /shop\??\.(?:name|promptpay_name)/);
  assert.doesNotMatch(source, /\bfallbackShopName|fallback_shop_name\b/);
});

test('the module does not depend on the untouched promptpay module', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /promptpay\.ts|from\s+['"].*promptpay['"]/);
});
