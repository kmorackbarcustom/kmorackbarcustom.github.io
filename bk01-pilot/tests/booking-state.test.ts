import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  countOpenWeeklyDays,
  resolveBookingPageState,
  type BookingStateInput,
} from '../apps/booking-consumer/src/lib/booking-state.ts';

const base: BookingStateInput = {
  isLoading: false,
  loadError: false,
  shop: { is_accepting_online_bookings: true },
  serviceCount: 1,
  staffCount: 1,
  openWeeklyDayCount: 6,
  everyServicePaymentBlocked: false,
};

test('OK when everything is present and no deposit needed', () => {
  assert.equal(resolveBookingPageState(base), 'OK');
});

test('loading and load error take precedence over everything', () => {
  assert.equal(resolveBookingPageState({ ...base, isLoading: true }), 'LOADING');
  assert.equal(resolveBookingPageState({ ...base, loadError: true }), 'LOAD_ERROR');
  // even when the shop and every other input are already bad
  const broken = { ...base, shop: null, serviceCount: 0, staffCount: 0, openWeeklyDayCount: 0 };
  assert.equal(resolveBookingPageState({ ...broken, isLoading: true }), 'LOADING');
  assert.equal(resolveBookingPageState({ ...broken, loadError: true }), 'LOAD_ERROR');
});

test('load error is distinct from shop not found', () => {
  assert.equal(resolveBookingPageState({ ...base, loadError: true, shop: null }), 'LOAD_ERROR');
  assert.equal(resolveBookingPageState({ ...base, loadError: false, shop: null }), 'SHOP_NOT_FOUND');
});

test('disabled shop', () => {
  assert.equal(
    resolveBookingPageState({ ...base, shop: { is_accepting_online_bookings: false } }),
    'BOOKING_DISABLED',
  );
  // unset eligibility flag is not treated as disabled
  assert.equal(resolveBookingPageState({ ...base, shop: {} }), 'OK');
});

test('partial configuration is reported in precedence order', () => {
  assert.equal(resolveBookingPageState({ ...base, serviceCount: 0 }), 'NO_SERVICES');
  assert.equal(resolveBookingPageState({ ...base, staffCount: 0 }), 'NO_STAFF');
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: 0 }), 'NO_SCHEDULE');
  assert.equal(
    resolveBookingPageState({ ...base, serviceCount: 0, staffCount: 0, openWeeklyDayCount: 0 }),
    'NO_SERVICES',
  );
  assert.equal(
    resolveBookingPageState({ ...base, staffCount: 0, openWeeklyDayCount: 0 }),
    'NO_STAFF',
  );
});

// --- KMO availability source: local_service.shop_weekly_schedules ---
//
// The NO_SCHEDULE input is a count of OPEN shop-weekly rows, not a staff-only
// schedule. These cases drive the resolver with the KMO weekly rows the page
// actually fetches via getShopAvailability().weeklySchedule.

const week = (...open: boolean[]) =>
  open.map((is_open, day_of_week) => ({ day_of_week, is_open }));

test('a shop with no open weekly day resolves NO_SCHEDULE', () => {
  const rows = week(false, false, false, false, false, false, false);
  assert.equal(countOpenWeeklyDays(rows), 0);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(rows) }), 'NO_SCHEDULE');
});

test('no weekly rows at all resolves NO_SCHEDULE', () => {
  const rows = week();
  assert.equal(countOpenWeeklyDays(rows), 0);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(rows) }), 'NO_SCHEDULE');
});

test('missing weekly rows are not open days', () => {
  // only Monday (1) and Tuesday (2) rows exist, both closed
  const rows = [
    { day_of_week: 1, is_open: false },
    { day_of_week: 2, is_open: false },
  ];
  assert.equal(countOpenWeeklyDays(rows), 0);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(rows) }), 'NO_SCHEDULE');
});

test('a single open weekly day is enough to keep the page usable', () => {
  // KMO real shop: 08:00-18:00, closed every Tuesday
  const rows = week(true, true, false, true, true, true, true);
  assert.equal(countOpenWeeklyDays(rows), 6);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(rows) }), 'OK');
});

test('countOpenWeeklyDays counts open rows only, over the generic seven-day shape', () => {
  assert.equal(countOpenWeeklyDays([]), 0);
  assert.equal(countOpenWeeklyDays(week(true, false, true, false, true, false, true)), 4);
});

test('accepts the real ShopWeeklySchedule rows booking-service returns', async () => {
  // Structural mirror of `ShopWeeklySchedule` in booking-service.ts -- the shape
  // of a local_service.shop_weekly_schedules row -- passed straight through.
  // The mirror is asserted against booking-service.ts below, so it cannot drift.
  interface ShopWeeklySchedule {
    day_of_week: number;
    is_open: boolean;
    open_time: string | null;
    close_time: string | null;
  }
  const weeklySchedule: ShopWeeklySchedule[] = [
    { day_of_week: 0, is_open: true, open_time: '08:00', close_time: '18:00' },
    { day_of_week: 1, is_open: true, open_time: '08:00', close_time: '18:00' },
    { day_of_week: 2, is_open: false, open_time: null, close_time: null },
    { day_of_week: 3, is_open: true, open_time: '08:00', close_time: '18:00' },
  ];
  assert.equal(countOpenWeeklyDays(weeklySchedule), 3);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(weeklySchedule) }), 'OK');

  const service = await readFile(new URL('../apps/booking-consumer/src/lib/booking-service.ts', import.meta.url), 'utf8');
  const shopWeekly = service.slice(
    service.indexOf('export interface ShopWeeklySchedule'),
    service.indexOf('export interface ShopAvailability'),
  );
  assert.match(shopWeekly, /day_of_week: number;/);
  assert.match(shopWeekly, /is_open: boolean;/);
  assert.match(shopWeekly, /open_time: string \| null;/);
  assert.match(shopWeekly, /close_time: string \| null;/);
  // and it is the row shape read from the KMO shop-weekly table
  assert.match(service, /\.from\('shop_weekly_schedules'\)/);
});

test('a weekly row open with no hours is still an open day (hours are the DB trigger\'s job)', () => {
  const rows = [{ day_of_week: 0, is_open: true, open_time: null, close_time: null }];
  assert.equal(countOpenWeeklyDays(rows), 1);
  assert.equal(resolveBookingPageState({ ...base, openWeeklyDayCount: countOpenWeeklyDays(rows) }), 'OK');
});

// --- payment-not-configured fail-closed state ---

test('payment-not-configured wins over OK but loses to real configuration gaps', () => {
  const blocked = { ...base, everyServicePaymentBlocked: true };
  assert.equal(resolveBookingPageState(blocked), 'PAYMENT_NOT_CONFIGURED');
  assert.equal(resolveBookingPageState({ ...blocked, loadError: true }), 'LOAD_ERROR');
  assert.equal(resolveBookingPageState({ ...blocked, shop: null }), 'SHOP_NOT_FOUND');
  assert.equal(
    resolveBookingPageState({ ...blocked, shop: { is_accepting_online_bookings: false } }),
    'BOOKING_DISABLED',
  );
  assert.equal(resolveBookingPageState({ ...blocked, serviceCount: 0 }), 'NO_SERVICES');
  assert.equal(resolveBookingPageState({ ...blocked, staffCount: 0 }), 'NO_STAFF');
  assert.equal(resolveBookingPageState({ ...blocked, openWeeklyDayCount: 0 }), 'NO_SCHEDULE');
});

// --- purity and KMO availability-source regression ---

const sourceUrl = new URL('../apps/booking-consumer/src/lib/booking-state.ts', import.meta.url);

test('the module is framework, network and database free', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /\bfrom\s+['"]/);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test('the NO_SCHEDULE source is the KMO shop-weekly model, never a staff-only schedule', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // the KMO availability source is named
  assert.match(source, /local_service\.shop_weekly_schedules/);
  assert.match(source, /openWeeklyDayCount/);
  assert.match(source, /getShopAvailability\(shopId\)\.weeklySchedule/);
  // and the staff-only schedule is not an availability source here
  assert.doesNotMatch(source, /staff_schedules/);
  assert.doesNotMatch(source, /getShopStaff/);
  assert.doesNotMatch(source, /staff_id/);
  assert.doesNotMatch(source, /is_working_day/);
  assert.doesNotMatch(source, /work_start|work_end/);
  // no upstream `scheduleCount` input field is declared or read
  assert.doesNotMatch(source, /scheduleCount\s*:/);
  assert.doesNotMatch(source, /input\.scheduleCount/);
  // the difference from upstream is stated, not silent
  assert.match(source.replace(/[\s*]+/g, ' '), /NOT a per-staff working-day count/);
});
