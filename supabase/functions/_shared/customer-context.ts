import { createServiceClient } from "./database.ts";
import { diffDays, isStopStatus } from "./constants.ts";

export type Booking = {
  id: number;
  job_id: string | null;
  product: string | null;
  queue_status: string | null;
  production_status: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  line_uid: string | null;
  deposit: number | string | null;
  deposit_paid: boolean | null;
  deposit_paid_at: string | null;
  total_amount: number | string | null;
  total_paid: boolean | null;
};

export type Order = {
  order_id: string | null;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  status: string | null;
  due_date: string | null;
  note: string | null;
};

// ponytail: most bookings are entered by staff from a phone call, not the LINE booking flow, so
// they carry a phone number but no line_uid - matching on line_uid alone misses almost all of them
// (confirmed against real data: 129/131 bookings had no line_uid). Fall back to phone when the
// customer types one in chat.
export function extractThaiPhone(text: string): string | null {
  const match = text.replace(/[-\s]/g, "").match(/0\d{8,9}/);
  return match ? match[0] : null;
}

// Identity model (bug K.9): `line_display_name` is LINE-owned and always reflects the current
// LINE profile. `name` is only seeded on the very first insert - after that the booking-form
// real name owns it via the kmo_sync_customer_from_booking trigger. getProfile() output must
// never overwrite `name`, or the LINE name and the real name clobber each other again.
export async function upsertLineCustomer(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
  displayName?: string | null,
): Promise<void> {
  const lineName = displayName ?? "LINE User";
  const { error: insertError } = await supabase.from("customers").upsert(
    {
      line_uid: lineUid,
      platform: "line",
      name: lineName,
      line_display_name: lineName,
      phone: "",
    },
    { onConflict: "line_uid", ignoreDuplicates: true },
  );
  if (insertError) {
    console.error(
      "[customer-context] line customer insert failed",
      insertError,
    );
  }

  const { error: updateError } = await supabase
    .from("customers")
    .update({ line_display_name: lineName })
    .eq("line_uid", lineUid);
  if (updateError) {
    console.error(
      "[customer-context] line_display_name update failed",
      updateError,
    );
  }
}

const BOOKING_COLS =
  "id, job_id, product, queue_status, production_status, appointment_date, pickup_date, line_uid, deposit, deposit_paid, deposit_paid_at, total_amount, total_paid";
const ORDER_COLS =
  "order_id, customer_name, brand, model, items, status, due_date, note";

// ponytail: the model never sees a "today" fact anywhere else in its context, so a stored
// pickup_date/due_date reads to it as a bare string with no reference point - it can't tell an
// overdue date from a future one on its own (confirmed live: customer asked on their pickup day,
// bot answered as if the date hadn't arrived yet). Pre-compute the overdue/due-today fact in code
// (reusing the same diffDays/isStopStatus the Telegram Friday bot already uses for this) instead
// of expecting the model to do date arithmetic - LLMs are unreliable at exact day counting even
// when told the current date.
function overdueNote(dateStr: string | null, status: string | null): string {
  if (!dateStr || isStopStatus(status)) return "";
  const days = diffDays(dateStr);
  if (days > 0) return ` (⚠️ เลยกำหนดมาแล้ว ${days} วัน)`;
  if (days === 0) return " (⚠️ ถึงกำหนดวันนี้พอดี)";
  return "";
}

const MISSING_BUSINESS_DATA = "ไม่มีข้อมูลในระบบ";

function formatOrderItems(items: unknown): string {
  if (items == null) return MISSING_BUSINESS_DATA;
  if (Array.isArray(items)) {
    const values = items
      .map((item) =>
        typeof item === "string" ? item.trim() : JSON.stringify(item)
      )
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : MISSING_BUSINESS_DATA;
  }
  if (typeof items === "string") return items.trim() || MISSING_BUSINESS_DATA;
  const serialized = JSON.stringify(items);
  return serialized && serialized !== "null"
    ? serialized
    : MISSING_BUSINESS_DATA;
}

function formatBusinessText(value: string | null): string {
  return value?.trim() || MISSING_BUSINESS_DATA;
}

function formatMoney(value: number | string | null): string {
  if (value == null || value === "") return MISSING_BUSINESS_DATA;
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? `${numeric.toLocaleString("th-TH")} บาท`
    : String(value);
}

export function formatBookingForAgent(booking: Booking): string {
  const depositStatus = booking.deposit_paid === true
    ? "ชำระแล้ว"
    : booking.deposit_paid === false
    ? "ยังไม่พบการชำระ"
    : MISSING_BUSINESS_DATA;
  const totalStatus = booking.total_paid === true
    ? "ชำระครบแล้ว"
    : booking.total_paid === false
    ? "ยังไม่ชำระครบ"
    : MISSING_BUSINESS_DATA;
  const paidAt = booking.deposit_paid_at?.trim() || MISSING_BUSINESS_DATA;
  return [
    `- งานจองคิว ${booking.job_id ?? "-"}: ${booking.product ?? "-"}`,
    `  สถานะคิว: ${booking.queue_status ?? "-"}`,
    `  สถานะผลิต: ${booking.production_status ?? "-"}`,
    `  นัดเข้า: ${booking.appointment_date ?? "-"}`,
    `  นัดรับ: ${booking.pickup_date ?? "-"}${
      overdueNote(booking.pickup_date, booking.production_status)
    }`,
    `  มัดจำ: ${depositStatus}`,
    `  ยอดมัดจำ: ${formatMoney(booking.deposit)}`,
    `  ชำระมัดจำเมื่อ: ${paidAt}`,
    `  ยอดรวม: ${formatMoney(booking.total_amount)}`,
    `  สถานะชำระเต็มจำนวน: ${totalStatus}`,
  ].join("\n");
}

export function formatOrderForAgent(order: Order): string {
  const vehicle = [order.brand, order.model]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ") || MISSING_BUSINESS_DATA;
  const lines = [
    `- ออเดอร์ ${formatBusinessText(order.order_id)}`,
    `  ชื่อลูกค้า: ${formatBusinessText(order.customer_name)}`,
    `  รถ: ${vehicle}`,
    `  รายการ: ${formatOrderItems(order.items)}`,
    `  สถานะ: ${formatBusinessText(order.status)}`,
    `  กำหนดส่ง: ${formatBusinessText(order.due_date)}${
      overdueNote(order.due_date, order.status)
    }`,
  ];
  if (order.note?.trim()) {
    lines.push(
      `  หมายเหตุภายในออเดอร์ (ไม่ใช่ข้อความลูกค้าปัจจุบัน): ${order.note.trim()}`,
    );
  }
  return lines.join("\n");
}

export async function getCustomerContext(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
  customerPhone?: string | null,
): Promise<string> {
  // Identity matching rule (PRD 3): a booking that is already linked to a line_uid can ONLY be
  // seen by that line_uid. A phone number the customer types in chat matches ONLY still-unlinked
  // rows - otherwise anyone could type a stranger's number and read/claim their booking.
  const ownQuery = supabase
    .from("bookings").select(BOOKING_COLS)
    .eq("line_uid", lineUid)
    .order("created_at", { ascending: false }).limit(3);
  const phoneQuery = customerPhone
    ? supabase
      .from("bookings").select(BOOKING_COLS)
      .eq("phone", customerPhone).is("line_uid", null)
      .order("created_at", { ascending: false }).limit(3)
    : Promise.resolve({ data: [], error: null });

  const [ownRes, phoneRes, { data: orders, error: ordersError }] = await Promise
    .all([
      ownQuery,
      phoneQuery,
      supabase
        .from("orders")
        .select(ORDER_COLS)
        .eq("line_user_id", lineUid)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  if (ownRes.error) {
    console.error(
      "[customer-context] own bookings lookup failed",
      ownRes.error,
    );
  }
  if (phoneRes.error) {
    console.error(
      "[customer-context] phone bookings lookup failed",
      phoneRes.error,
    );
  }
  if (ordersError) {
    console.error("[customer-context] orders lookup failed", ordersError);
  }

  // Own (linked) rows first, then phone-matched unlinked rows, deduped by id, capped at 3.
  const seen = new Set<number>();
  const bookingRows = [
    ...((ownRes.data ?? []) as Booking[]),
    ...((phoneRes.data ?? []) as Booking[]),
  ]
    .filter((b) => (seen.has(b.id) ? false : seen.add(b.id)))
    .slice(0, 3);
  const orderRows = (orders ?? []) as Order[];

  // One-time claim: permanently link the most recent phone-matched *unlinked* booking to this LINE
  // account so future lookups don't need the phone again. Only the latest one (old duplicate
  // bookings under the same phone don't all need backfilling), and only if still unlinked - the
  // `.is("line_uid", null)` on the update is the race guard.
  const claimable = bookingRows.find((b) => !b.line_uid);
  if (customerPhone && claimable) {
    const { error: backfillError } = await supabase
      .from("bookings")
      .update({ line_uid: lineUid })
      .eq("id", claimable.id)
      .is("line_uid", null);
    if (backfillError) {
      console.error(
        "[customer-context] line_uid backfill failed",
        backfillError,
      );
    }
  }

  if (bookingRows.length === 0 && orderRows.length === 0) {
    return "ไม่พบข้อมูลงานจองคิว/ออเดอร์ของลูกค้ารายนี้ในระบบ";
  }

  const today = new Date().toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const lines = [
    `วันนี้คือวันที่ ${today} (ใช้เทียบวันนัด/กำหนดส่งด้านล่างเสมอ ห้ามพูดถึงวันนัดที่ผ่านมาแล้วราวกับยังไม่ถึง)`,
    "ข้อมูลด้านล่างเป็น authoritative business data จากระบบสำหรับ LINE user ปัจจุบัน ใช้ตอบคำถามลูกค้าเท่านั้น",
    "Grounding contract: ห้ามเปลี่ยนความหมายของ field ที่มี label; ห้ามใช้ค่าจาก ชื่อลูกค้า เป็น รถ/รุ่นรถ; ห้ามสร้างชื่อลูกค้า ยี่ห้อ/รุ่นรถ รายการงาน สถานะ วันที่ หรือสถานะการชำระที่ไม่มีอยู่ในข้อมูลนี้",
    "Payment contract: เรื่องมัดจำ/ชำระเงินต้องอ้างอิงค่าปัจจุบันจากข้อมูลนี้ทุกครั้ง ห้ามใช้ความจำจากประวัติแชทแทนฐานข้อมูล",
  ];
  for (const b of bookingRows) {
    lines.push(formatBookingForAgent(b));
  }
  for (const o of orderRows) {
    lines.push(formatOrderForAgent(o));
  }
  return lines.join("\n");
}
