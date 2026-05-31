import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { dateOnlyInBangkok, diffDays, isStopStatus } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { escapeHtml, formatDateThai, formatItems, mechanicMention } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

type BookingRow = {
  job_id: string | null;
  customer_name: string | null;
  phone: string | null;
  brand: string | null;
  model: string | null;
  product: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  production_status: string | null;
  assigned_mechanic_username: string | null;
};

type OrderRow = {
  order_id: string | null;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  due_date: string | null;
  status: string | null;
  assigned_mechanic_username: string | null;
};

function bookingLine(booking: BookingRow, suffix = ""): string {
  return [
    `  • ${escapeHtml(booking.customer_name)}`,
    `| ${escapeHtml(booking.brand)} ${escapeHtml(booking.model)}`,
    `| ${escapeHtml(booking.product)}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function orderLine(order: OrderRow, suffix = ""): string {
  return [
    `  • ${escapeHtml(order.customer_name)}`,
    `| ${escapeHtml(order.brand)} ${escapeHtml(order.model)}`,
    `| ${escapeHtml(formatItems(order.items))}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function section(title: string, lines: string[], total: number): string {
  const extra = total > lines.length ? [`  • ...อีก ${total - lines.length} งาน`] : [];
  return [`<b>${title}</b>`, lines.length ? [...lines, ...extra].join("\n") : "  • ไม่มี"].join("\n");
}

function heading(title: string, username: string): string {
  return [`<b>${title} ${mechanicMention(username)}</b>`, "--------------------"].join("\n");
}

serve(async (req) => {
  const functionName = "morning-summary";
  console.log(`[${functionName}] Starting...`);

  try {
    const scheduleGuard = shouldRunAtBangkokHour(req, 10);
    if (scheduleGuard) return scheduleGuard;

    const supabase = createServiceClient();
    const settings = await getSettings(supabase);
    const chatId = settings.telegram_group_chat_id;
    if (!chatId) {
      return jsonResponse({ error: "telegram_group_chat_id is not configured" }, 400);
    }

    const today = dateOnlyInBangkok();

    const { data: bookingsRaw, error: bookingsError } = await supabase
      .from("bookings")
      .select("job_id,customer_name,phone,brand,model,product,appointment_date,pickup_date,production_status,assigned_mechanic_username")
      .limit(1000);
    if (bookingsError) throw bookingsError;

    const { data: ordersRaw, error: ordersError } = await supabase
      .from("orders")
      .select("order_id,customer_name,brand,model,items,due_date,status,assigned_mechanic_username")
      .limit(1000);
    if (ordersError) throw ordersError;

    const bookings = (bookingsRaw ?? []) as BookingRow[];
    const orders = (ordersRaw ?? []) as OrderRow[];

    const overdueBookings = bookings.filter((booking) =>
      booking.appointment_date && booking.appointment_date < today && !isStopStatus(booking.production_status)
    );
    const todayBookings = bookings.filter((booking) =>
      booking.appointment_date === today && !isStopStatus(booking.production_status)
    );
    const todayDueOrders = orders.filter((order) =>
      order.due_date === today && !isStopStatus(order.status)
    );
    const unfinishedOrders = orders.filter((order) => !isStopStatus(order.status));
    const overdueOrders = orders.filter((order) =>
      order.due_date && order.due_date < today && !isStopStatus(order.status)
    );

    const bookingDefault = settings.booking_mechanic_default || "";
    const orderDefault = settings.order_mechanic_default || "";

    const message = [
      `📌 <b>สรุปงานเช้า</b> (${formatDateThai(today)})`,
      "",
      heading("🔧 งานหน้าร้าน", bookingDefault),
      "",
      section(
        `🔴 งานค้าง: ${overdueBookings.length} งาน`,
        overdueBookings.slice(0, 12).map((booking) =>
          bookingLine(booking, `- ค้าง ${diffDays(booking.appointment_date ?? today)} วัน`)
        ),
        overdueBookings.length,
      ),
      "",
      section(
        `📅 ลูกค้านัดวันนี้: ${todayBookings.length} งาน`,
        todayBookings.slice(0, 12).map((booking) =>
          bookingLine(booking, `- สถานะ ${escapeHtml(booking.production_status)}`)
        ),
        todayBookings.length,
      ),
      "",
      heading("📋 งานออเดอร์", orderDefault),
      "",
      section(
        `📦 ออเดอร์ต้องส่งวันนี้: ${todayDueOrders.length} งาน`,
        todayDueOrders.slice(0, 12).map((order) =>
          orderLine(order, `- สถานะ ${escapeHtml(order.status)}`)
        ),
        todayDueOrders.length,
      ),
      "",
      section(
        `🟡 ออเดอร์ยังไม่เสร็จ: ${unfinishedOrders.length} งาน`,
        unfinishedOrders.slice(0, 12).map((order) =>
          orderLine(order, `- กำหนดส่ง ${formatDateThai(order.due_date)} / สถานะ ${escapeHtml(order.status)}`)
        ),
        unfinishedOrders.length,
      ),
      "",
      section(
        `⏰ ออเดอร์ค้างส่ง: ${overdueOrders.length} งาน`,
        overdueOrders.slice(0, 12).map((order) =>
          orderLine(order, `- เกินกำหนด ${diffDays(order.due_date ?? today)} วัน`)
        ),
        overdueOrders.length,
      ),
      "",
      "═══════════════════════════",
      `รวมต้องตามวันนี้: ${overdueBookings.length + todayBookings.length + todayDueOrders.length + unfinishedOrders.length + overdueOrders.length} งาน`,
    ].join("\n");

    const result = await sendTelegramMessage(chatId, message);
    return jsonResponse({
      sent: Boolean(result?.ok),
      overdue_bookings: overdueBookings.length,
      today_bookings: todayBookings.length,
      today_due_orders: todayDueOrders.length,
      unfinished_orders: unfinishedOrders.length,
      overdue_orders: overdueOrders.length,
    });
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
