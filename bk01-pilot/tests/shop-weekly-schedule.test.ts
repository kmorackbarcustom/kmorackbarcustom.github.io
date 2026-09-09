import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const patchPath = 'supabase/kmo-baseline/KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql';

test('shop weekly schedule is a generic seven-day configuration, not a hardcoded Tuesday rule', () => {
  const sql = read(patchPath);
  assert.match(sql, /shop_weekly_schedules/);
  assert.match(sql, /day_of_week BETWEEN 0 AND 6/);
  assert.match(sql, /jsonb_array_length\(p_days\) <> 7/);
  assert.match(sql, /upsert_shop_weekly_schedule/);
  assert.match(sql, /ON CONFLICT\(shop_id, day_of_week\) DO UPDATE/);
});

test('database rejects bookings on recurring closed weekdays and outside shop hours', () => {
  const sql = read(patchPath);
  assert.match(sql, /trg_enforce_shop_weekly_booking_hours/);
  assert.match(sql, /SHOP_CLOSED_RECURRING_WEEKDAY/);
  assert.match(sql, /SHOP_OUTSIDE_WEEKLY_HOURS/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF shop_id, booking_date, start_time, end_time/);
});

test('admin and consumer both use shop weekly schedule as a first-class layer', () => {
  const adminService = read('apps/booking-admin/src/lib/admin-service.ts');
  const adminPage = read('apps/booking-admin/src/app/dashboard/page.tsx');
  const consumerService = read('apps/booking-consumer/src/lib/booking-service.ts');
  const consumerPage = read('apps/booking-consumer/src/app/book/[slug]/page.tsx');

  assert.match(adminService, /\.from\('shop_weekly_schedules'\)/);
  assert.match(adminService, /rpc\('upsert_shop_weekly_schedule'/);
  assert.match(adminPage, /shopWeeklySchedule\.map/);
  assert.match(adminPage, /saveShopWeeklySchedule/);

  assert.match(consumerService, /\.from\('shop_weekly_schedules'\)/);
  assert.match(consumerPage, /weeklyDay && !weeklyDay\.is_open/);
  assert.match(consumerPage, /outsideShopHours/);
  assert.match(consumerPage, /const candidateSlots = weeklyDay\?\.is_open/);
  assert.match(consumerPage, /cursor \+= 30/);
});

test('KMO seed is evidence-based but idempotent and never overwrites later owner changes', () => {
  const sql = read(patchPath);
  assert.match(sql, /08:00-18:00, closed every Tuesday/);
  assert.match(sql, /\(2,false,NULL::time,NULL::time\)/);
  assert.match(sql, /ON CONFLICT\(shop_id,day_of_week\) DO NOTHING/);
});
