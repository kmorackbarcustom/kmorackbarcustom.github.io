import { createServiceClient } from "./database.ts";

type Booking = {
  job_id: string | null;
  product: string | null;
  queue_status: string | null;
  production_status: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
};

type Order = {
  order_id: string | null;
  status: string | null;
  due_date: string | null;
};

export async function getCustomerContext(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
): Promise<string> {
  const [{ data: bookings, error: bookingsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase
      .from("bookings")
      .select("job_id, product, queue_status, production_status, appointment_date, pickup_date")
      .eq("line_uid", lineUid)
      .order("created_at", { ascending: false })
      .limit(3),
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
