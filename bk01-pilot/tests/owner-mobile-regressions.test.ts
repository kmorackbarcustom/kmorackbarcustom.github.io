import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('public consumer does not filter on private is_active columns', () => {
  const service = read('apps/booking-consumer/src/lib/booking-service.ts');
  assert.doesNotMatch(service, /\.eq\('is_active',\s*true\)/);
  assert.match(service, /\.from\('services'\)[\s\S]*?\.eq\('shop_id', shopId\);/);
  assert.match(service, /\.from\('staff'\)[\s\S]*?\.eq\('shop_id', shopId\);/);
});

test('shop profile save is decoupled from PromptPay settings', () => {
  const page = read('apps/booking-admin/src/app/dashboard/page.tsx');
  const service = read('apps/booking-admin/src/lib/admin-service.ts');
  const patch = read('supabase/kmo-baseline/KMO_BK01_SHOP_PROFILE_DECOUPLE_PATCH.sql');
  assert.match(page, /<form onSubmit=\{handleSaveShopProfile\}/);
  assert.match(service, /rpc\('update_shop_profile'/);
  assert.doesNotMatch(patch, /promptpay/i);
});

test('schedule time fields allow direct mobile typing', () => {
  const page = read('apps/booking-admin/src/app/dashboard/page.tsx');
  assert.doesNotMatch(page, /type="time"/);
  assert.match(page, /inputMode="numeric"/);
  assert.match(page, /normalizeTimeInput/);
});

test('saving one staff schedule does not reload and erase other unsaved edits', () => {
  const page = read('apps/booking-admin/src/app/dashboard/page.tsx');
  const start = page.indexOf('const handleSaveSchedule');
  const end = page.indexOf('const handleOpenAddService', start);
  const handler = page.slice(start, end);
  assert.match(handler, /saveStaffWeeklySchedule/);
  assert.doesNotMatch(handler, /loadDashboardBookings/);
  assert.match(handler, /shopDay\?\.isOpen/);
});

test('numeric service fields keep editable string state instead of forcing zero', () => {
  const page = read('apps/booking-admin/src/app/dashboard/page.tsx');
  assert.match(page, /useState\('45'\)/);
  assert.match(page, /setServicePrice\(e\.target\.value\)/);
  assert.match(page, /setServiceDeposit\(e\.target\.value\)/);
  assert.doesNotMatch(page, /setServiceDeposit\(Math\.round/);
});
