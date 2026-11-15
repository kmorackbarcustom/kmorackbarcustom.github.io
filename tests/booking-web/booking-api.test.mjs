import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { createApi, mapError, getRequestId, rotateRequestId, newRequestId } = require('../../kmo-booking-api.js');
const url = 'https://offline.invalid';
const key = 'test-anon';
const payload = {
  customer_name: 'ผู้ทดสอบ', phone: '000', source: 'Line', line_uid: null, brand: 'Honda', model: null,
  product: 'test', color: null, appointment_date: '2026-11-16', pickup_date: '2026-11-18', cart_meta: {},
  estimated_total: 0, source_page: 'booking.html', queue_status: 'bad', production_status: 'bad', job_id: 'bad', images: ['bad']
};
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const apiWith = fetchImpl => createApi({ supabaseUrl: url, anonKey: key, fetchImpl });

test('submits only contract payload and request id, uploads after create, then attaches using returned job', async () => {
  const calls = [];
  const api = apiWith(async (target, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push([target, body]);
    if (target.endsWith('/create_booking')) return json({ job_id: 'KLI-1', booking_id: 4, replay: false });
    if (target.endsWith('/attach_booking_images')) return json(null);
    throw new Error('unexpected call');
  });
  const result = await api.submitBooking({ payload, requestId: 'request-1', files: ['photo'], uploadFile: async (_, jobId) => { calls.push(['upload', jobId]); return `${url}/storage/${jobId}/photo`; } });
  assert.deepEqual(result, { job_id: 'KLI-1', replay: false, imagesOk: true });
  assert.deepEqual(calls.map(call => call[0]), [`${url}/rest/v1/rpc/create_booking`, 'upload', `${url}/rest/v1/rpc/attach_booking_images`]);
  assert.equal(calls[0][1].p_request_id, 'request-1');
  assert.deepEqual(Object.keys(calls[0][1].p_payload), ['customer_name', 'phone', 'source', 'line_uid', 'brand', 'model', 'product', 'color', 'appointment_date', 'pickup_date', 'cart_meta', 'estimated_total', 'source_page']);
  assert.equal(calls[1][1], 'KLI-1');
  assert.equal(calls[2][1].p_request_id, 'request-1');
  assert.deepEqual(calls[2][1].p_images, [`${url}/storage/KLI-1/photo`]);
});

test('image failure after booking reports success without issuing a second create', async () => {
  let creates = 0;
  const api = apiWith(async target => {
    if (target.endsWith('/create_booking')) { creates++; return json({ job_id: 'KLI-2', replay: false }); }
    throw new Error('unexpected request');
  });
  const result = await api.submitBooking({ payload, requestId: 'same', files: ['photo'], uploadFile: async () => { throw new Error('upload failed'); } });
  assert.equal(result.job_id, 'KLI-2');
  assert.equal(result.imagesOk, false);
  assert.equal(creates, 1);
});

test('attaches successful uploads when another image fails and reports the partial failure', async () => {
  const calls = [];
  const api = apiWith(async (target, options) => {
    calls.push(target);
    return target.endsWith('/create_booking') ? json({ job_id: 'KLI-PARTIAL', replay: false }) : json(null);
  });
  const result = await api.submitBooking({ payload, requestId: 'id', files: ['ok', 'bad'], uploadFile: async (file, jobId) => {
    if (file === 'bad') throw new Error('upload failed');
    return `https://photo.invalid/${jobId}`;
  } });
  assert.equal(result.imagesOk, false);
  assert.deepEqual(calls.map(target => target.split('/').at(-1)), ['create_booking', 'attach_booking_images']);
});

test('same request ID can replay and replay response remains a success result', async () => {
  const ids = [];
  const api = apiWith(async (target, options) => {
    if (target.endsWith('/create_booking')) { ids.push(JSON.parse(options.body).p_request_id); return json({ job_id: 'KLI-3', replay: true }); }
    throw new Error('unexpected request');
  });
  const first = await api.submitBooking({ payload, requestId: 'retry-id' });
  const second = await api.submitBooking({ payload, requestId: 'retry-id' });
  assert.deepEqual(ids, ['retry-id', 'retry-id']);
  assert.equal(first.replay, true);
  assert.equal(second.job_id, 'KLI-3');
});

test('KMO_IMAGES_ALREADY_ATTACHED is treated as attached', async () => {
  const api = apiWith(async target => target.endsWith('/create_booking')
    ? json({ job_id: 'KLI-4', replay: true })
    : json({ code: 'P0001', message: 'KMO_IMAGES_ALREADY_ATTACHED' }, 400));
  const result = await api.submitBooking({ payload, requestId: 'id', files: ['photo'], uploadFile: async () => 'https://photo.invalid/x' });
  assert.equal(result.imagesOk, true);
});

test('day usage fails closed for network, HTTP errors, object body and incomplete rows', async t => {
  const failures = [
    ['network', async () => { throw new TypeError('offline'); }],
    ['http 500', async () => json({ message: 'private db error' }, 500)],
    ['empty body', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('empty response'); } })],
    ['object body', async () => json({ day: '2026-11-16' })],
    ['empty rows', async () => json([])],
    ['missing is_closed', async () => json([{ day: '2026-11-01', used: 0, cap: 3, closed_reason: null }])]
  ];
  for (const [name, fetchImpl] of failures) await t.test(name, async () => {
    await assert.rejects(apiWith(fetchImpl).loadDayUsage('2026-11-01', '2026-11-30'), error => error.kind === 'LOAD_FAILED');
  });
});

test('maps known KMO codes and hides raw constraints, SQL and HTML errors', () => {
  for (const code of ['KMO_BAD_REQUEST', 'KMO_APPOINT_PAST', 'KMO_APPOINT_CLOSED_WEEKDAY', 'KMO_APPOINT_HOLIDAY', 'KMO_PICKUP_MISSING', 'KMO_PICKUP_BEFORE_APPOINT', 'KMO_MIN_WORKDAYS', 'KMO_DAY_FULL', 'KMO_TOO_MANY_IMAGES', 'KMO_IMAGE_URL_INVALID', 'KMO_REQUEST_NOT_FOUND', 'KMO_IMAGES_ALREADY_ATTACHED', 'KMO_BAD_RANGE']) {
    assert.equal(mapError({ code: 'P0001', message: code }).code, code);
  }
  for (const error of [
    { code: '23505', message: 'duplicate key value violates unique constraint "bookings_job_id_key"' },
    'duplicate key value violates unique constraint "bookings_job_id_key"', '<html>502 upstream</html>',
    { status: 500, message: 'internal server error' }
  ]) assert.deepEqual(mapError(error), { kind: 'unknown', code: 'UNKNOWN' });
  assert.deepEqual(mapError(new TypeError('Failed to fetch')), { kind: 'network', code: 'NETWORK' });
});

test('legacy fallback is restricted to exact 404 PGRST202 and can be disabled', async t => {
  const cases = [
    ['PGRST202', 404, true], ['KMO_DAY_FULL', 400, false], ['PGRST202', 500, false], ['unauthorized', 401, false], ['OTHER', 404, false]
  ];
  for (const [code, status, shouldFallback] of cases) await t.test(`${status} ${code}`, async () => {
    const calls = [];
    const api = apiWith(async (target, options) => {
      calls.push(target);
      if (target.endsWith('/create_booking')) return json({ code, message: code }, status);
      if (target.endsWith('/generate_job_id')) return json('KLI-LEGACY');
      if (target.endsWith('/bookings')) return json(null);
      return json([]);
    });
    if (shouldFallback) {
      const result = await api.submitBooking({ payload, requestId: 'id' });
      assert.equal(result.job_id, 'KLI-LEGACY');
      assert.ok(calls.some(target => target.endsWith('/generate_job_id')));
    } else {
      await assert.rejects(api.submitBooking({ payload, requestId: 'id' }), error => error.code === (code === 'KMO_DAY_FULL' ? code : 'UNKNOWN'));
      assert.equal(calls.some(target => target.endsWith('/generate_job_id')), false);
    }
  });
  const disabledCalls = [];
  const disabled = createApi({ supabaseUrl: url, anonKey: key, enableLegacyFallback: false, fetchImpl: async target => { disabledCalls.push(target); return json({ code: 'PGRST202' }, 404); } });
  await assert.rejects(disabled.submitBooking({ payload, requestId: 'id' }), error => error.code === 'UNKNOWN');
  assert.equal(disabledCalls.length, 1);
});

test('legacy insert body keeps old statuses (table default is รอตรวจสอบ) and omits empty images', async () => {
  let inserted;
  const api = apiWith(async (target, options) => {
    if (target.endsWith('/create_booking')) return json({ code: 'PGRST202' }, 404);
    if (target.endsWith('/generate_job_id')) return json('KLI-LEGACY');
    if (target.endsWith('/bookings')) { inserted = JSON.parse(options.body); return json(null); }
    return json([]);
  });
  await api.submitBooking({ payload, requestId: 'id' });
  assert.equal(inserted.queue_status, 'ยืนยัน');
  assert.equal(inserted.production_status, 'รอเริ่มงาน');
  assert.equal(inserted.job_id, 'KLI-LEGACY');
  assert.equal('images' in inserted, false);
});

test('day usage fallback returns legacy rows and disabled flag fails closed', async () => {
  const fetchImpl = async target => target.endsWith('/get_booking_day_usage')
    ? json({ code: 'PGRST202' }, 404)
    : target.endsWith('/get_booking_availability')
      ? json([{ appointment_date: '2026-11-16' }])
      : json([]);
  const rows = await apiWith(fetchImpl).loadDayUsage('2026-11-16', '2026-11-17');
  assert.deepEqual(rows.map(row => row.day), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(Object.keys(rows[0]), ['day', 'used', 'cap', 'is_closed', 'closed_reason']);
  const disabled = createApi({ supabaseUrl: url, anonKey: key, enableLegacyFallback: false, fetchImpl });
  await assert.rejects(disabled.loadDayUsage('2026-11-16', '2026-11-17'), error => error.kind === 'LOAD_FAILED');
});

test('session storage exceptions use in-memory request IDs and rotation', () => {
  const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const first = getRequestId(brokenStorage);
  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.equal(getRequestId(brokenStorage), first);
  const next = rotateRequestId(brokenStorage);
  assert.notEqual(next, first);
  assert.equal(getRequestId(brokenStorage), next);
  assert.match(newRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('pages delegate booking rules and legacy endpoints only appear inside the API module', async () => {
  const booking = await readFile(new URL('../../booking.html', import.meta.url), 'utf8');
  const calendar = await readFile(new URL('../../calendar.html', import.meta.url), 'utf8');
  const module = await readFile(new URL('../../kmo-booking-api.js', import.meta.url), 'utf8');
  for (const page of [booking, calendar]) {
    assert.match(page, /kmo-booking-api\.js/);
    assert.doesNotMatch(page, /getDay\(\)\s*(?:===|!==)\s*2|DAILY_CAP|MIN_BOOKING_DAYS|generate_job_id|\/rest\/v1\/bookings|holidays\?select/);
    for (const match of page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
  }
  assert.match(module, /LEGACY-FALLBACK BEGIN \(T6 phase D: delete this block and the flag\)/);
  const errorKeys = ['KMO_BAD_REQUEST', 'KMO_APPOINT_PAST', 'KMO_APPOINT_CLOSED_WEEKDAY', 'KMO_APPOINT_HOLIDAY', 'KMO_PICKUP_MISSING', 'KMO_PICKUP_BEFORE_APPOINT', 'KMO_MIN_WORKDAYS', 'KMO_DAY_FULL', 'KMO_TOO_MANY_IMAGES', 'KMO_IMAGE_URL_INVALID', 'KMO_REQUEST_NOT_FOUND', 'KMO_IMAGES_ALREADY_ATTACHED', 'KMO_BAD_RANGE'];
  for (const code of errorKeys) assert.ok((booking.match(new RegExp(code, 'g')) || []).length >= 2, `${code} has a message and mapping`);
  assert.match(booking, /if \(error && error\.kind === 'rejected'.*rotateRequestId/);
  assert.match(booking, /error\.kind === 'network' \? 'networkError' : 'unknownError'/);
});
