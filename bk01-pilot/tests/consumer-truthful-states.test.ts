import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Source-reading contract for the consumer booking page's truthful states.
//
// LR-01 added the pure resolver `resolveBookingPageState` /
// `countOpenWeeklyDays`, but the page kept its own ad-hoc `loadError` / `!shop`
// checks and fell through to the step-1 stepper for every other failure mode,
// so a partly-configured shop (no services, no staff, no open weekly day, or a
// deposit-required shop with no payment setup) or a transient failure still
// showed a dead stepper under HTTP 200.
//
// This contract pins the wiring: the page must actually import and CALL the
// LR-01 owner, render a dedicated screen for every non-OK state (including
// NO_SCHEDULE and PAYMENT_NOT_CONFIGURED, which exist nowhere else in the
// page), and keep SHOP_NOT_FOUND distinct from LOAD_ERROR.
// See apps/booking-consumer/src/lib/booking-state.ts.
const PAGE_PATH = 'apps/booking-consumer/src/app/book/[slug]/page.tsx';
const TH_MESSAGES_PATH = 'apps/booking-consumer/messages/th.json';
const EN_MESSAGES_PATH = 'apps/booking-consumer/messages/en.json';

const read = (path: string) => readFileSync(path, 'utf8');
const pageSource = () => read(PAGE_PATH);
const pageLines = (source: string) => source.split(/\r?\n/);

test('the consumer truthful-states test reads the real booking page', () => {
  // Positive assertion: the assertions below must never pass on an empty or
  // truncated string, so pin the artifact that is actually being inspected.
  assert.equal(existsSync(PAGE_PATH), true, `${PAGE_PATH} must exist`);
  const source = pageSource();

  assert.match(source, /'use client'/);
  assert.match(source, /export default function BookingPage\(\)/);
  assert.ok(source.length > 1000, 'page source must not be empty or truncated');
  assert.ok(pageLines(source).length > 100, 'page source must be the full page');
  // The stepper surface this contract sits in front of must really be there.
  assert.match(source, /t\('step1\.title'\)/);
  assert.match(source, /t\('step2\.title'\)/);
  assert.match(source, /t\('step3\.title'\)/);
});

test('the page imports the LR-01 state resolver and calls it', () => {
  const source = pageSource();

  // The LR-01 owner is imported from the booking-state module ...
  assert.match(
    source,
    /import\s*\{[\s\S]{0,200}?resolveBookingPageState,[\s\S]{0,200}?countOpenWeeklyDays[\s\S]{0,200}?\}\s*from\s*'[^']*lib\/booking-state'/,
  );
  // ... and actually invoked on the page's own data.
  assert.match(source, /resolveBookingPageState\(\s*\{/);
  assert.match(source, /isLoading:\s*isLoadingShop/);
  assert.match(source, /loadError,/);
  assert.match(source, /shop,/);
  assert.match(source, /serviceCount:\s*services\.length/);
  assert.match(source, /staffCount:\s*staffList\.length/);
  assert.match(source, /openWeeklyDayCount,/);
  assert.match(source, /everyServicePaymentBlocked,/);
});

test('the page derives the NO_SCHEDULE input with countOpenWeeklyDays, not a staff schedule', () => {
  const source = pageSource();

  assert.match(source, /const\s+openWeeklyDayCount\s*=\s*countOpenWeeklyDays\(\s*shopWeeklySchedule\s*\)/);
  // The KMO availability source is the shop-weekly rows the page already fetches.
  assert.match(source, /shopWeeklySchedule/);
  assert.match(source, /getShopAvailability/);
});

test('every non-OK state renders its own dedicated screen', () => {
  const source = pageSource();

  // Each state is a distinct render branch, so no failure mode can silently
  // fall through to the stepper.
  assert.match(source, /pageState\s*===\s*'LOADING'/);
  assert.match(source, /pageState\s*===\s*'LOAD_ERROR'/);
  assert.match(source, /pageState\s*===\s*'SHOP_NOT_FOUND'/);
  assert.match(source, /pageState\s*===\s*'BOOKING_DISABLED'/);
  assert.match(source, /pageState\s*===\s*'NO_SERVICES'/);
  assert.match(source, /pageState\s*===\s*'NO_STAFF'/);
  assert.match(source, /pageState\s*===\s*'NO_SCHEDULE'/);
  assert.match(source, /pageState\s*===\s*'PAYMENT_NOT_CONFIGURED'/);
});

test('SHOP_NOT_FOUND and LOAD_ERROR stay distinct screens', () => {
  const source = pageSource();

  // The failed-fetch screen keeps its own copy ...
  const loadErrorIndex = source.search(/pageState\s*===\s*'LOAD_ERROR'/);
  const notFoundIndex = source.search(/pageState\s*===\s*'SHOP_NOT_FOUND'/);
  assert.ok(loadErrorIndex >= 0, 'the LOAD_ERROR branch must exist');
  assert.ok(notFoundIndex > loadErrorIndex, 'SHOP_NOT_FOUND must be its own branch, not merged');

  assert.match(source, /t\('loadFailed\.title'\)/);
  assert.match(source, /t\('loadFailed\.description'\)/);
  assert.match(source, /t\('notFound\.title'\)/);
  assert.match(source, /t\('notFound\.description'\)/);

  // The not-found screen is the shop-absent one; the load failure is not
  // allowed to claim the shop does not exist.
  const notFoundSlice = source.slice(notFoundIndex, notFoundIndex + 900);
  assert.doesNotMatch(notFoundSlice, /loadFailed\./);
});

test('the disabled-shop and blocked states reuse the existing blocked copy', () => {
  const source = pageSource();

  assert.match(source, /t\('blocked\.title'\)/);
  assert.match(source, /t\('blocked\.description'\)/);
  assert.match(source, /t\('callShop',\s*\{\s*phone:\s*shopPhone\s*\}\)/);
  // The in-page blocked branch is preserved for the stepper shell.
  assert.match(source, /isBookingBlocked/);
});

test('the new NO_SCHEDULE and PAYMENT_NOT_CONFIGURED screens use the setupState keys', () => {
  const source = pageSource();

  assert.match(source, /t\('setupState\.noServices'\)/);
  assert.match(source, /t\('setupState\.noStaff'\)/);
  assert.match(source, /t\('setupState\.noSchedule'\)/);
  assert.match(source, /t\('setupState\.paymentNotConfigured'\)/);
});

test('every non-OK screen keeps a contact path to the shop', () => {
  const source = pageSource();

  assert.match(source, /shopPhoneHref/);
  assert.match(source, /t\('callShopEmergency',\s*\{\s*phone:\s*shopPhone\s*\}\)/);
  assert.match(source, /const\s+shopPhone\s*=\s*shop\?\.phone\?\.trim\(\)\s*\|\|\s*t\('shopPhoneMissing'\)/);
});

test('both message files define the new setupState keys', () => {
  const th = JSON.parse(read(TH_MESSAGES_PATH));
  const en = JSON.parse(read(EN_MESSAGES_PATH));

  for (const [path, messages] of [
    [TH_MESSAGES_PATH, th],
    [EN_MESSAGES_PATH, en],
  ] as const) {
    const setupState = messages?.booking?.setupState;
    assert.equal(typeof setupState, 'object', `${path} booking.setupState must be an object`);
    // The pre-existing keys are still present ...
    assert.equal(typeof setupState.noServices, 'string', `${path} booking.setupState.noServices`);
    assert.equal(typeof setupState.noStaff, 'string', `${path} booking.setupState.noStaff`);
    // ... and the two new states are real, non-empty copy.
    assert.equal(typeof setupState.noSchedule, 'string', `${path} booking.setupState.noSchedule`);
    assert.ok(setupState.noSchedule.trim().length > 0, `${path} noSchedule must not be empty`);
    assert.equal(
      typeof setupState.paymentNotConfigured,
      'string',
      `${path} booking.setupState.paymentNotConfigured`,
    );
    assert.ok(
      setupState.paymentNotConfigured.trim().length > 0,
      `${path} paymentNotConfigured must not be empty`,
    );
  }

  // Thai says the shop has not published online booking hours / payment setup
  // and to contact the shop; English says the same.
  assert.match(th.booking.setupState.noSchedule, /ติดต่อร้าน/);
  assert.match(th.booking.setupState.paymentNotConfigured, /ติดต่อร้าน/);
  assert.match(en.booking.setupState.noSchedule, /contact the shop/i);
  assert.match(en.booking.setupState.paymentNotConfigured, /contact the shop/i);
});

test('the payment-not-configured gate keeps the create-hold semantics, per service', () => {
  const source = pageSource();

  // The same gate the create-hold guard uses, evaluated per service: the shop
  // must require a deposit AND that service must carry its own positive
  // authoritative deposit AND no payment method may be available.
  assert.match(source, /shop\?\.require_deposit\s*===\s*true/);
  assert.match(source, /authoritativeDepositAmount\(\s*service\.deposit_amount\s*\)/);
  assert.match(source, /serviceDepositAmount\s*!==\s*null/);
  assert.match(source, /!paymentMethodAvailable/);
  // Any single bookable service clears the page-level block.
  assert.match(source, /services\.every\(/);
  // The literal create-hold guard text is untouched (LR-02A).
  assert.match(source, /shop\.require_deposit && depositAmount > 0 && !paymentMethodAvailable/);
});

test('the LR-02A payment authority wiring is untouched', () => {
  const source = pageSource();

  assert.match(source, /resolvePaymentInstruction/);
  assert.match(source, /resolveStaticQrInstruction/);
  assert.match(source, /authoritativeDepositAmount/);
  assert.match(source, /paymentMethodAvailable/);
  assert.match(source, /shop\?\.promptpay_name\?\.trim\(\)/);
});

test('the LR-02B hold-expiry wiring is untouched', () => {
  const source = pageSource();

  assert.match(source, /remainingHoldSeconds\(\s*holdResult\?\.expires_at,\s*expiryNow\s*\)/);
  assert.match(
    source,
    /const\s+holdHasTimeRemaining\s*=\s*holdSecondsRemaining\s*!==\s*null\s*&&\s*holdSecondsRemaining\s*>\s*0\s*;/,
  );
  assert.match(source, /\{\s*holdHasTimeRemaining\s*\?\s*\(/);
  assert.match(source, /t\('step3\.expired'\)/);
});
