import "../_testing/env.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./index.ts";
import { lastHandler } from "../_testing/server.ts";

const handler = lastHandler!;

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

function mockFetch() {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    let body: Record<string, unknown> = {};
    if (typeof raw === "string") { try { body = JSON.parse(raw); } catch { /* body is non-JSON */ } }
    calls.push({ url, body });
    return Response.json({ ok: true });
  }) as typeof fetch;
}

function req(payload: unknown) {
  return new Request("https://fake.invalid/functions/v1/telegram-notify", { method: "POST", body: JSON.stringify(payload) });
}

Deno.test("telegram-notify handles HOLIDAY_CONFLICT and preserves old INSERT behavior", async () => {
  await import("../_testing/telegram-notify-baseline.ts");
  const legacyHandler = lastHandler!;
  assert(legacyHandler);

  mockFetch();
  const bookings = [
    { job_id: "KMO-1", customer_name: "First", brand: "Honda", model: "ADV350", appointment_date: "2026-11-19", pickup_date: "2026-11-21", hit: "appointment" },
    { job_id: "KMO-2", customer_name: "Second", brand: "Yamaha", model: "XMAX", appointment_date: "2026-11-20", pickup_date: "2026-11-19", hit: "pickup" },
    { job_id: "KMO-3", customer_name: "Third", brand: "BMW", model: "R1300", appointment_date: "2026-11-19", pickup_date: "2026-11-19", hit: "both" },
  ];
  const response = await handler(req({ type: "HOLIDAY_CONFLICT", table: "holidays", record: { id: 1, date: "2026-11-19", reason: "ร้านปิด", created_at: "ignored", phone: "PII-RECORD-PHONE", line_uid: "PII-RECORD-LINE" }, bookings: bookings.map((b) => ({ ...b, phone: "PII-BOOKING-PHONE", line_uid: "PII-BOOKING-LINE" })) }));
  const message = String(calls[0]?.body.text ?? "");
  assertEquals([response.status, calls.length, calls[0]?.body.chat_id], [200, 1, "fake-staff-chat"]);
  for (const part of ["19 พ.ย. 2569", "ร้านปิด", "KMO-1", "First", "Honda ADV350", "นัดเข้าร้าน", "รับรถ 21 พ.ย. 2569", "KMO-2", "Second", "Yamaha XMAX", "วันรับรถ", "KMO-3", "Third", "ทั้งสองวัน", "พนักงานติดต่อลูกค้าเพื่อนัดใหม่"]) assert(message.includes(part), part);
  for (const pii of ["PII-RECORD-PHONE", "PII-RECORD-LINE", "PII-BOOKING-PHONE", "PII-BOOKING-LINE"]) assert(!message.includes(pii), pii);
  assert(!calls.some(({ url }) => url.includes("api.line.me")));

  mockFetch();
  await handler(req({ type: "HOLIDAY_CONFLICT", table: "holidays", record: { date: "2026-11-19", reason: `<b>x</b> & "y"` }, bookings: [{ ...bookings[0], customer_name: `<b>x</b> & "y"` }] }));
  const escaped = String(calls[0]?.body.text ?? "");
  assert(escaped.includes("&lt;b&gt;x&lt;/b&gt; &amp; \"y\""));
  assert(!escaped.includes("<b>x</b>"));

  mockFetch();
  await handler(req({ type: "HOLIDAY_CONFLICT", table: "holidays", record: { date: "2026-11-19", reason: "close" }, bookings: Array.from({ length: 30 }, (_, i) => ({ ...bookings[0], job_id: `J-${i}`, customer_name: `Name ${i}` })) }));
  const longMessage = String(calls[0]?.body.text ?? "");
  assert(longMessage.length <= 4096);
  assert(longMessage.includes("…และอีก 10 คิว"));

  mockFetch();
  let result = await handler(req({ type: "HOLIDAY_CONFLICT", table: "holidays", record: { date: "2026-11-19" }, bookings: [] }));
  assertEquals([result.status, calls.length], [200, 0]);
  for (const bad of [
    { type: "HOLIDAY_CONFLICT", table: "holidays", record: {}, bookings: [] },
    { type: "HOLIDAY_CONFLICT", table: "holidays", record: { date: "bad" }, bookings: [] },
    { type: "HOLIDAY_CONFLICT", table: "holidays", record: { date: "2026-11-19" }, bookings: {} },
  ]) {
    mockFetch(); result = await handler(req(bad));
    assertEquals([result.status, calls.length], [400, 0]);
  }
  mockFetch();
  // malformed JSON / null body keep the legacy error behaviour (500), same as the original handler
  for (const body of ["null", "{"]) {
    const mk = () => new Request("https://fake.invalid/functions/v1/telegram-notify", { method: "POST", body });
    const legacy = await legacyHandler(mk());
    mockFetch();
    result = await handler(mk());
    assertEquals([result.status, calls.length], [legacy.status, 0]);
  }

  const goldenInputs = [
    { table: "bookings", type: "INSERT", record: { job_id: "KMO-42", customer_name: "Ada", phone: "0812345678", brand: "Honda", model: "ADV350", product: "Rack", color: "Black", appointment_date: "2026-11-19", pickup_date: "2026-11-21", source: "LINE" } },
    { table: "orders", type: "INSERT", record: { order_id: "ORD-42", customer_name: "Ada", contact: "contact", brand: "Honda", model: "ADV350", items: ["Rack"], color: "Black", unit: 2, payment_type: "deposit500", delivery_type: "pickup", start_date: "2026-11-19", due_date: "2026-11-21" } },
  ];
  for (const input of goldenInputs) {
    mockFetch();
    const oldResponse = await legacyHandler(req(input));
    const oldStatus = oldResponse.status;
    const oldBody = String(calls[0]?.body.text ?? "");
    mockFetch();
    const newResponse = await handler(req(input));
    assertEquals([newResponse.status, calls.length, calls[0]?.body.text], [oldStatus, 1, oldBody]);
  }

  mockFetch(); result = await handler(req({ type: "UPDATE", table: "bookings", record: {} }));
  assertEquals([result.status, await result.text(), calls.length], [200, "skip", 0]);
  mockFetch(); result = await handler(req({ type: "INSERT", table: "xyz", record: {} }));
  assertEquals([result.status, await result.text(), calls.length], [200, "unknown table", 0]);
});
