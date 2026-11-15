import "../_testing/env.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, MAX_PAGES, retryLinePush, setRetryWait } from "./index.ts";
import { booking, fakeState, resetFake } from "../_testing/fake-supabase.ts";
import { addDays, dateOnlyInBangkok } from "../_shared/constants.ts";

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let lineFailures = 0;
let telegramFailures = 0;

function mockFetch() {
  calls = [];
  lineFailures = 0;
  telegramFailures = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    let body: Record<string, unknown> = {};
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof raw === "string") { try { body = JSON.parse(raw); } catch { /* body is non-JSON */ } }
    calls.push({ url, body });
    if (url.includes("api.line.me") && lineFailures-- > 0) return new Response("failed", { status: 500 });
    if (url.includes("api.telegram.org") && telegramFailures-- > 0) return Response.json({ ok: false, description: "fake fail" }, { status: 500 });
    return Response.json({ ok: true, result: { message_id: 1, chat: { id: 1 } } });
  }) as typeof fetch;
}

function request() {
  return new Request("https://fake.invalid/functions/v1/appointment-reminder?force=true", { headers: { "x-kmo-force": "true" } });
}

function deliveryCalls() { return calls.filter(({ url }) => url.includes("api.telegram.org") || url.includes("api.line.me")); }

Deno.test("appointment-reminder handler covers cancellations, dedupe, paging, retries and failures", async () => {
  const originalError = console.error;
  console.error = () => {};
  mockFetch();
  const cancelledQueue = booking(1); cancelledQueue.queue_status = "ยกเลิก";
  const cancelledProduction = booking(2); cancelledProduction.production_status = "ยกเลิก";
  const nullStatuses = booking(3); nullStatuses.queue_status = null; nullStatuses.production_status = null;
  const active = booking(4);
  const otherDay = booking(5); otherDay.appointment_date = "2000-01-01";
  resetFake({ bookings: [cancelledQueue, cancelledProduction, nullStatuses, active, otherDay] });
  let response = await handler(request());
  let json = await response.json();
  assertEquals([json.skipped_cancelled, json.telegram_sent, json.line_sent], [2, 2, 2]);
  assertEquals(deliveryCalls().length, 4);

  mockFetch(); resetFake({ bookings: [booking(1)] });
  response = await handler(request()); await response.json();
  const firstSendCount = deliveryCalls().length;
  response = await handler(request()); json = await response.json();
  assertEquals([firstSendCount, deliveryCalls().length, json.telegram_sent, json.line_sent, json.skipped_duplicate], [2, 2, 0, 0, 2]);

  mockFetch(); resetFake({ bookings: [booking(1)], logs: [{ booking_id: 1, notification_type: `appointment_reminder_staff_telegram:${addDays(dateOnlyInBangkok(), 1)}`, success: false }] });
  // A failed historical attempt does not suppress a new delivery.
  response = await handler(request()); json = await response.json();
  assertEquals([json.telegram_sent, deliveryCalls().length], [1, 2]);

  mockFetch(); resetFake({ bookings: [booking(1)], logReadError: true });
  response = await handler(request());
  assertEquals([response.status, deliveryCalls().length], [500, 0]);

  mockFetch(); resetFake({ bookings: Array.from({ length: 101 }, (_, i) => ({ ...booking(i + 1), line_uid: null })), logReadErrorAt: 2 });
  response = await handler(request());
  assertEquals([response.status, fakeState().logReads, deliveryCalls().length], [500, 2, 0]);

  mockFetch(); resetFake({ bookings: Array.from({ length: 250 }, (_, i) => ({ ...booking(i + 1), line_uid: null })) });
  response = await handler(request()); json = await response.json();
  assertEquals(fakeState().orders, [["id", { ascending: true }], ["id", { ascending: true }], ["id", { ascending: true }]]);
  assertEquals([fakeState().ranges.length, fakeState().logReads, fakeState().ranges[0], fakeState().ranges[1], fakeState().ranges[2], json.telegram_sent], [3, 3, [0, 99], [100, 199], [200, 299], 250]);

  assertEquals(MAX_PAGES, 20);
  mockFetch(); resetFake({ fullPages: true });
  response = await handler(request()); json = await response.json();
  assertEquals([fakeState().ranges.length, fakeState().ranges.length <= MAX_PAGES, json.truncated], [MAX_PAGES, true, true]);

  mockFetch(); resetFake({ bookings: [booking(1)] }); lineFailures = 2;
  setRetryWait(async () => {});
  response = await handler(request()); json = await response.json();
  assertEquals([calls.filter(({ url }) => url.includes("api.line.me")).length, json.line_sent], [3, 1]);

  mockFetch(); resetFake({ bookings: [booking(1)] }); lineFailures = 10;
  response = await handler(request()); json = await response.json();
  assertEquals([calls.filter(({ url }) => url.includes("api.line.me")).length, json.line_failed, fakeState().logs.find((row) => row.notification_type?.toString().startsWith("appointment_reminder_line:"))?.success], [3, 1, false]);
  response = await handler(request()); json = await response.json();
  assertEquals([calls.filter(({ url }) => url.includes("api.telegram.org")).length, calls.filter(({ url }) => url.includes("api.line.me")).length, json.telegram_sent, json.line_failed], [1, 6, 0, 1]);

  mockFetch(); resetFake({ bookings: [booking(1)], insertError: true });
  response = await handler(request()); json = await response.json();
  assertEquals([response.status, json.telegram_sent, json.line_sent], [200, 1, 1]);
  mockFetch(); resetFake({ bookings: [booking(1)], insertThrows: true });
  response = await handler(request()); json = await response.json();
  assertEquals([response.status, json.telegram_sent, json.line_sent], [200, 1, 1]);

  mockFetch(); resetFake({ bookings: [booking(1)] }); telegramFailures = 10;
  response = await handler(request()); await response.json();
  assertEquals(calls.filter(({ url }) => url.includes("api.telegram.org")).length, 3);
  assertEquals(fakeState().logs.find((row) => row.notification_type?.toString().startsWith("appointment_reminder_staff_telegram:"))?.success, false);

  mockFetch(); resetFake({ bookings: [] });
  response = await handler(request()); json = await response.json();
  assertEquals([response.status, json.telegram_sent, json.line_sent], [200, 0, 0]);

  mockFetch(); resetFake({ settings: {} });
  response = await handler(request());
  assertEquals(response.status, 400);

  const delays: number[] = [];
  await retryLinePush(() => Promise.resolve(false), (ms) => { delays.push(ms); return Promise.resolve(); });
  assertEquals(delays, [500, 1000]);
  setRetryWait((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  console.error = originalError;
});
