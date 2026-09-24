import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Source-reading contract for the consumer booking page's hold countdown.
//
// The page must never invent hold time. The remaining seconds have to be
// derived from the server-authoritative hold row's `expires_at` through the
// LR-01 `remainingHoldSeconds` owner, and when that value is unusable the page
// must render the expired/unavailable state instead of a fabricated countdown.
//
// `remainingHoldSeconds` returns 0 (not null) for a hold that has genuinely
// elapsed: zero is a real value meaning "no time left", while null only means
// "no usable server value at all". The banner must therefore be gated on a
// STRICTLY POSITIVE remaining value, otherwise an elapsed hold renders a frozen
// 00:00 banner and the expired recovery branch becomes unreachable.
// See apps/booking-consumer/src/lib/payment-instruction.ts.
const PAGE_PATH = 'apps/booking-consumer/src/app/book/[slug]/page.tsx';

const read = (path: string) => readFileSync(path, 'utf8');
const pageSource = () => read(PAGE_PATH);
const pageLines = (source: string) => source.split(/\r?\n/);

test('the consumer hold-expiry test reads the real booking page', () => {
  // Positive assertion: the assertions below must never pass on an empty or
  // truncated string, so pin the artifact that is actually being inspected.
  assert.equal(existsSync(PAGE_PATH), true, `${PAGE_PATH} must exist`);
  const source = pageSource();

  assert.match(source, /'use client'/);
  assert.match(source, /export default function BookingPage\(\)/);
  assert.ok(source.length > 1000, 'page source must not be empty or truncated');
  assert.ok(pageLines(source).length > 100, 'page source must be the full page');
  // The countdown surface this contract is about must really be in the page.
  assert.match(source, /formatCountdown/);
  assert.match(source, /step3\.timer/);
});

test('the page keeps no hard-coded fifteen-minute countdown source', () => {
  const source = pageSource();

  // No literal starting constant, in either the initial state or the
  // hold-created branch.
  assert.doesNotMatch(source, /useState<number>\(\s*900\s*\)/);
  assert.doesNotMatch(source, /setTimeLeft\s*\(\s*900\b/);
  // The invented local countdown state is gone entirely.
  assert.doesNotMatch(source, /\bsetTimeLeft\b/);
  assert.doesNotMatch(source, /\btimeLeft\b/);
  // No other "15 mins"-style literal seed either.
  assert.doesNotMatch(source, /(?:setTimeLeft|setTimeRemaining|setSecondsRemaining)\s*\(/);
});

test('the remaining seconds are derived from the server expires_at via remainingHoldSeconds', () => {
  const source = pageSource();

  // The LR-01 owner is imported and actually used on the hold row's value.
  assert.match(
    source,
    /import\s*\{[\s\S]{0,300}?remainingHoldSeconds,[\s\S]{0,300}?\}\s*from\s*'[^']*lib\/payment-instruction'/,
  );
  assert.match(source, /remainingHoldSeconds\(\s*holdResult\?\.expires_at/);

  // The rendered countdown is that derived value, not a local number.
  assert.match(source, /formatCountdown\(\s*holdSecondsRemaining\s*\)/);
  assert.doesNotMatch(source, /formatCountdown\(\s*(?:timeLeft|900)\b/);

  // expires_at itself must be the server field the page reads.
  assert.match(source, /expires_at/);
  assert.match(read('apps/booking-consumer/src/lib/booking-service.ts'), /expires_at:\s*string\s*\|\s*null/);
});

test('the banner is gated on a strictly positive remaining value, never on mere non-nullness', () => {
  const source = pageSource();

  // The derived guard must be the single owner of "does time actually remain?":
  // a usable server value (not null) that is ALSO strictly greater than zero.
  assert.match(
    source,
    /const\s+holdHasTimeRemaining\s*=\s*holdSecondsRemaining\s*!==\s*null\s*&&\s*holdSecondsRemaining\s*>\s*0\s*;/,
  );
  // A zero-second countdown is expired, so the text is withheld for it too.
  assert.match(
    source,
    /const\s+holdCountdownText\s*=\s*holdHasTimeRemaining\s*\?\s*formatCountdown\(\s*holdSecondsRemaining\s*\)\s*:\s*null\s*;/,
  );

  // The rendered JSX banner branch hangs off that strict flag ...
  assert.match(source, /\{\s*holdHasTimeRemaining\s*\?\s*\(/);
  // ... and never off bare non-nullness, which would let a zero-second hold
  // render a frozen 00:00 banner.
  assert.doesNotMatch(source, /holdCountdownText\s*!==\s*null\s*\?/);
  assert.doesNotMatch(source, /holdSecondsRemaining\s*!==\s*null\s*\?/);
  // Non-nullness on its own is no longer a render condition anywhere.
  assert.doesNotMatch(source, /holdSecondsRemaining\s*!==\s*null\s*\)\s*\{/);
});

test('an elapsed hold renders the expired recovery branch, not a frozen 00:00 banner', () => {
  const source = pageSource();

  // The expired branch is the zero/null outcome of the strict banner guard.
  const guardIndex = source.search(/\{\s*holdHasTimeRemaining\s*\?\s*\(/);
  const expiredIndex = source.indexOf("t('step3.expired')");
  assert.ok(guardIndex >= 0, 'the banner must be guarded by the strict remaining-time flag');
  assert.ok(
    expiredIndex > guardIndex,
    'the expired branch must be the else of the strict guard, so an elapsed hold reaches it',
  );

  // The whole expired branch (label + recovery path to step 2) sits inside that
  // same guard chain, i.e. it is reachable exactly when the banner is not.
  const recoveryIndex = source.indexOf('setStep(2)', expiredIndex);
  assert.ok(recoveryIndex > expiredIndex, 'the expired branch must keep its recovery action');

  // The expired label and the retained countdown keys.
  assert.match(source, /t\('step3\.expired'\)/);
  assert.match(source, /t\('step3\.timerUnit'\)/);

  // The confirm button still treats both zero and null remaining time as not
  // submittable, so an elapsed hold cannot be confirmed either.
  assert.match(
    source,
    /disabled=\{[^}]*holdCountdownText\s*===\s*null[^}]*holdSecondsRemaining\s*===\s*0[^}]*\}/,
  );
});

test('no fabricated countdown is rendered when the server value is unusable', () => {
  const source = pageSource();

  // Null (no usable server value at all) is still treated as unavailable: the
  // banner cannot render from it because the strict flag requires non-nullness.
  assert.match(source, /holdSecondsRemaining\s*!==\s*null/);
  // And the page never substitutes a number for an unusable value.
  assert.doesNotMatch(source, /remainingHoldSeconds\([^)]*\)\s*\?\?/);
  assert.doesNotMatch(source, /\|\|\s*(?:900|60|15)\b/);
});

test('the local ticker recomputes from the server timestamp and cannot go below zero', () => {
  const source = pageSource();

  // The ticker only re-reads the clock; it never decrements a stored number, so
  // it cannot drift below zero or assume a fixed start.
  assert.match(source, /setExpiryNow\(Date\.now\(\)\)/);
  assert.doesNotMatch(source, /prev\s*-\s*1/);
  assert.doesNotMatch(source, /holdSecondsRemaining\s*-\s*1/);
});

test('the payment authority wiring from LR-02A is untouched', () => {
  const source = pageSource();

  assert.match(source, /resolvePaymentInstruction/);
  assert.match(source, /resolveStaticQrInstruction/);
  assert.match(source, /authoritativeDepositAmount/);
  assert.match(source, /shop\.require_deposit && depositAmount > 0 && !paymentMethodAvailable/);
  assert.match(source, /paymentMethodAvailable/);
  assert.match(source, /promptpayName/);
});
