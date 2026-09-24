import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Source-reading contract for the consumer booking page's deposit authority.
//
// The page must never invent a monetary value, a money recipient or an
// account-holder name. Everything the deposit control renders has to come from
// the LR-01 payment-instruction module and the server-authoritative hold row.
// See apps/booking-consumer/src/lib/payment-instruction.ts.
const PAGE_PATH = 'apps/booking-consumer/src/app/book/[slug]/page.tsx';

const read = (path: string) => readFileSync(path, 'utf8');
const pageSource = () => read(PAGE_PATH);
const pageLines = (source: string) => source.split(/\r?\n/);

test('the consumer payment authority test reads the real booking page', () => {
  // Positive assertion: the assertions below must never pass on an empty or
  // truncated string, so pin the artifact that is actually being inspected.
  assert.equal(existsSync(PAGE_PATH), true, `${PAGE_PATH} must exist`);
  const source = pageSource();

  assert.match(source, /'use client'/);
  assert.match(source, /export default function BookingPage\(\)/);
  assert.ok(source.length > 1000, 'page source must not be empty or truncated');
  assert.ok(pageLines(source).length > 100, 'page source must be the full page');
});

test('the page never falls back to a numeric deposit amount', () => {
  const source = pageSource();

  // (a1) No `?? <number>` on any line that mentions a deposit: a deposit amount
  // must never be defaulted to a literal or an invented integer.
  for (const line of pageLines(source).filter(line => /deposit/i.test(line))) {
    assert.doesNotMatch(line, /\?\?\s*\d+/, `deposit line must not default to a numeric literal: ${line.trim()}`);
  }

  // (a2) The historical KMO defect: `... ?? 100`.
  assert.doesNotMatch(source, /\|\|\s*100\b/);
});

test('the account-holder name is never derived from the shop name', () => {
  // (b) An account name that could be fabricated from the shop name (or a
  // translated fallback) is not a verified PromptPay holder.
  for (const line of pageLines(pageSource()).filter(line => /promptpay|account ?name/i.test(line))) {
    assert.doesNotMatch(
      line,
      /shop\?\.name|shop\.name|fallbackShopName/,
      `account-name line must not fall back to the shop name: ${line.trim()}`,
    );
  }
});

test('the page resolves payment authority through the LR-01 module', () => {
  // (c) The page must consume the single honest owner of amount, recipient and
  // provenance instead of recomputing them locally.
  const source = pageSource();
  assert.match(source, /resolvePaymentInstruction/);
  assert.match(source, /resolveStaticQrInstruction/);
  assert.match(source, /authoritativeDepositAmount/);
});

test('the page carries no hard-coded PromptPay account number', () => {
  // (d) A hard-coded recipient is not a configured shop recipient.
  assert.doesNotMatch(pageSource(), /0812345678/);
});
