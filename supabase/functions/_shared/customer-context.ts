import { createServiceClient } from "./database.ts";

type Booking = {
  id: number;
  job_id: string | null;
  product: string | null;
  queue_status: string | null;
  production_status: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  line_uid: string | null;
};

type Order = {
  order_id: string | null;
  status: string | null;
  due_date: string | null;
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
    { line_uid: lineUid, platform: "line", name: lineName, line_display_name: lineName, phone: "" },
    { onConflict: "line_uid", ignoreDuplicates: true },
  );
  if (insertError) console.error("[customer-context] line customer insert failed", insertError);

  const { error: updateError } = await supabase
    .from("customers")
    .update({ line_display_name: lineName })
    .eq("line_uid", lineUid);
  if (updateError) console.error("[customer-context] line_display_name update failed", updateError);
}

export async function getCustomerContext(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
  customerPhone?: string | null,
): Promise<string> {
  let bookingsQuery = supabase
    .from("bookings")
    .select("id, job_id, product, queue_status, production_status, appointment_date, pickup_date, line_uid")
    .order("created_at", { ascending: false })
    .limit(3);
  bookingsQuery = customerPhone
    ? bookingsQuery.or(`line_uid.eq.${lineUid},phone.eq.${customerPhone}`)
    : bookingsQuery.eq("line_uid", lineUid);

  const [{ data: bookings, error: bookingsError }, { data: orders, error: ordersError }] = await Promise.all([
    bookingsQuery,
    supabase
      .from("orders")
      .select("order_id, status, due_date")
      .eq("line_user_id", lineUid)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  if (bookingsError) console.error("[customer-context] bookings lookup failed", bookingsError);
  if (ordersError) console.error("[customer-context] orders lookup failed", ordersError);

  const bookingRows = (bookings ?? []) as Booking[];
  const orderRows = (orders ?? []) as Order[];

  // Permanently link this phone-matched booking to the LINE account so future lookups don't need
  // the customer to retype their phone - only the most recent unlinked row, per user's call (old
  // duplicate bookings under the same phone don't all need backfilling, just the latest one).
  const latestBooking = bookingRows[0];
  if (customerPhone && latestBooking && !latestBooking.line_uid) {
    const { error: backfillError } = await supabase
      .from("bookings")
      .update({ line_uid: lineUid })
      .eq("id", latestBooking.id)
      .or("line_uid.is.null,line_uid.eq.");
    if (backfillError) console.error("[customer-context] line_uid backfill failed", backfillError);
  }

  if (bookingRows.length === 0 && orderRows.length === 0) {
    return "ไม่พบข้อมูลงานจองคิว/ออเดอร์ของลูกค้ารายนี้ในระบบ";
  }

  const lines = ["ข้อมูลงานจองคิว/ออเดอร์ของลูกค้ารายนี้ในระบบ (ใช้ตอบคำถามลูกค้าเท่านั้น ห้ามเดาข้อมูลอื่นนอกเหนือจากนี้):"];
  for (const b of bookingRows) {
    lines.push(
      `- งานจองคิว ${b.job_id ?? "-"}: ${b.product ?? "-"} | สถานะคิว: ${b.queue_status ?? "-"} | สถานะผลิต: ${b.production_status ?? "-"} | นัดเข้า: ${b.appointment_date ?? "-"} | นัดรับ: ${b.pickup_date ?? "-"}`,
    );
  }
  for (const o of orderRows) {
    lines.push(`- ออเดอร์ ${o.order_id ?? "-"}: สถานะ: ${o.status ?? "-"} | กำหนดส่ง: ${o.due_date ?? "-"}`);
  }
  return lines.join("\n");
}
