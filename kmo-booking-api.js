(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KmoBookingApi = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const REQUEST_ID_KEY = 'kmo_booking_request_id';
  const PAYLOAD_KEYS = ['customer_name', 'phone', 'source', 'line_uid', 'brand', 'model', 'product', 'color', 'appointment_date', 'pickup_date', 'cart_meta', 'estimated_total', 'source_page'];
  const ERROR_CODES = new Set(['KMO_BAD_REQUEST', 'KMO_APPOINT_PAST', 'KMO_APPOINT_CLOSED_WEEKDAY', 'KMO_APPOINT_HOLIDAY', 'KMO_PICKUP_MISSING', 'KMO_PICKUP_BEFORE_APPOINT', 'KMO_MIN_WORKDAYS', 'KMO_DAY_FULL', 'KMO_TOO_MANY_IMAGES', 'KMO_IMAGE_URL_INVALID', 'KMO_REQUEST_NOT_FOUND', 'KMO_IMAGES_ALREADY_ATTACHED', 'KMO_BAD_RANGE']);
  let memoryRequestId;

  function newRequestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function getRequestId(storage) {
    try {
      const store = storage === undefined ? globalThis.sessionStorage : storage;
      const id = store && store.getItem(REQUEST_ID_KEY);
      if (id) return id;
      memoryRequestId ||= newRequestId();
      if (store) store.setItem(REQUEST_ID_KEY, memoryRequestId);
    } catch (_) { memoryRequestId ||= newRequestId(); }
    return memoryRequestId;
  }
  function rotateRequestId(storage) {
    memoryRequestId = newRequestId();
    try {
      const store = storage === undefined ? globalThis.sessionStorage : storage;
      if (store) store.setItem(REQUEST_ID_KEY, memoryRequestId);
    } catch (_) { /* Keep the in-memory ID when storage is unavailable. */ }
    return memoryRequestId;
  }
  function mapError(value) {
    if (value && value.name === 'TypeError') return { kind: 'network', code: 'NETWORK' };
    let body = value && value.body ? value.body : value;
    if (typeof value === 'string') {
      try { body = JSON.parse(value); } catch (_) { body = {}; }
    }
    const candidate = body && typeof body === 'object' ? String(body.message || body.code || '') : '';
    if (ERROR_CODES.has(candidate)) return { kind: 'rejected', code: candidate };
    return { kind: 'unknown', code: 'UNKNOWN' };
  }
  function createApi({ supabaseUrl, anonKey, fetchImpl = globalThis.fetch, enableLegacyFallback }) {
    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
    async function request(path, body) {
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      let data;
      try { data = await response.json(); } catch (_) { data = null; }
      if (!response.ok) {
        const error = new Error('request failed');
        error.status = response.status;
        error.body = data;
        throw error;
      }
      return data;
    }
    async function loadDayUsage(start, end) {
      try {
        try {
          const data = await request('get_booking_day_usage', { p_start: start, p_end: end });
          const expectedDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
          if (!Array.isArray(data) || data.length !== expectedDays || data.some(row => !row || !['day', 'used', 'cap', 'is_closed', 'closed_reason'].every(key => Object.prototype.hasOwnProperty.call(row, key)))) throw new Error('invalid day usage');
          return data;
        } catch (error) {
          return await useLegacyIfMissing(error, () => loadLegacyDayUsage(start, end));
        }
      } catch (_) { throw Object.assign(new Error('day usage unavailable'), { kind: 'LOAD_FAILED' }); }
    }
    /* LEGACY-FALLBACK BEGIN (T6 phase D: delete this block and the flag) */
    const ENABLE_LEGACY_FALLBACK = true;
    function isMissingRpc(error) { return error && error.status === 404 && error.body && error.body.code === 'PGRST202'; }
    async function loadLegacyDayUsage(start, end) {
      const availability = await request('get_booking_availability', { p_start: start, p_end: end });
      if (!Array.isArray(availability)) throw new Error('invalid availability');
      const holidayResponse = await fetchImpl(`${supabaseUrl}/rest/v1/holidays?select=date&date=gte.${encodeURIComponent(start)}&date=lte.${encodeURIComponent(end)}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
      if (!holidayResponse.ok) throw new Error('holiday lookup failed');
      const holidays = await holidayResponse.json();
      if (!Array.isArray(holidays)) throw new Error('invalid holidays');
      const usedByDay = {};
      availability.forEach(row => { if (row && row.appointment_date) usedByDay[row.appointment_date] = (usedByDay[row.appointment_date] || 0) + 1; });
      const holidayDays = new Set(holidays.map(row => row.date));
      const startDate = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      const rows = [];
      for (const date = new Date(startDate); date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
        const day = date.toISOString().slice(0, 10);
        const closedReason = date.getUTCDay() === 2 ? 'weekday' : holidayDays.has(day) ? 'holiday' : null;
        rows.push({ day, used: usedByDay[day] || 0, cap: 3, is_closed: !!closedReason, closed_reason: closedReason });
      }
      return rows;
    }
    async function legacySubmit(payload, files, uploadFile) {
      const jobId = await request('generate_job_id', { p_platform: payload.source });
      const urls = [];
      for (let i = 0; i < files.length; i++) urls.push(await uploadFile(files[i], jobId, i));
      const response = await fetchImpl(`${supabaseUrl}/rest/v1/bookings`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ ...payload, queue_status: 'ยืนยัน', production_status: 'รอเริ่มงาน', job_id: jobId, ...(urls.length ? { images: urls } : {}) }) });
      if (!response.ok) throw Object.assign(new Error('legacy booking failed'), { status: response.status });
      return { job_id: jobId, replay: false, imagesOk: true };
    }
    async function useLegacyIfMissing(error, fallback) {
      if (enableLegacyFallback !== false && ENABLE_LEGACY_FALLBACK && isMissingRpc(error)) return fallback();
      throw error;
    }
    /* LEGACY-FALLBACK END */
    async function submitBooking({ payload, files = [], requestId, uploadFile = async () => { throw new Error('upload unavailable'); } }) {
      const safePayload = Object.fromEntries(PAYLOAD_KEYS.filter(key => Object.prototype.hasOwnProperty.call(payload, key)).map(key => [key, payload[key]]));
      let booking;
      try {
        try { booking = await request('create_booking', { p_payload: safePayload, p_request_id: requestId }); }
        catch (error) {
          return await useLegacyIfMissing(error, () => legacySubmit(safePayload, files, uploadFile));
        }
      } catch (error) { throw mapError(error); }
      if (!booking || typeof booking.job_id !== 'string' || typeof booking.replay !== 'boolean') throw { kind: 'unknown', code: 'UNKNOWN' };
      const result = { job_id: booking.job_id, replay: booking.replay === true, imagesOk: true };
      if (!files.length) return result;
      const urls = [];
      let imageError;
      for (let i = 0; i < files.length; i++) {
        try { urls.push(await uploadFile(files[i], booking.job_id, i)); }
        catch (error) { imageError ||= mapError(error).code; }
      }
      if (urls.length) {
        try { await request('attach_booking_images', { p_request_id: requestId, p_images: urls }); }
        catch (error) {
          const mapped = mapError(error);
          if (mapped.code !== 'KMO_IMAGES_ALREADY_ATTACHED') imageError ||= mapped.code;
        }
      }
      return imageError ? { ...result, imagesOk: false, imageError } : result;
    }
    return { loadDayUsage, submitBooking, getRequestId, rotateRequestId, newRequestId, mapError };
  }
  return { createApi, newRequestId, getRequestId, rotateRequestId, mapError };
});
