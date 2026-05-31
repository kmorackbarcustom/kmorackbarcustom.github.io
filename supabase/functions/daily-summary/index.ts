import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { dateOnlyInBangkok, diffDays, isStopStatus } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { escapeHtml, formatDateThai, formatItems, mechanicMention } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

type BookingSummaryRow = {
  job_id: string;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  product: string | null;
  appointment_date: string | null;
  production_status: string | null;
  assigned_mechanic_username: string | null;
  updated_at: string | null;
};

type OrderSummaryRow = {
  order_id: string;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  due_date: string | null;
  status: string | null;
  assigned_mechanic_username: string | null;
  updated_at: string | null;
};

function bookingLine(booking: BookingSummaryRow, suffix = ""): string {
  return [
    `  • ${escapeHtml(booking.customer_name)}`,
    `| ${escapeHtml(booking.brand)} ${escapeHtml(booking.model)}`,
    `| ${escapeHtml(booking.product)}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function orderLine(order: OrderSummaryRow, suffix = ""): string {
  return [
    `  • ${escapeHtml(order.customer_name)}`,
    `| ${escapeHtml(order.brand)} ${escapeHtml(order.model)}`,
    `| ${escapeHtml(formatItems(order.items))}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function heading(title: string, username: string): string {
  return [`<b>${title} ${mechanicMention(username)}</b>`, "--------------------"].join("\n");
}

serve(async (req) => {
  const functionName = "daily-summary";
  console.log(`[${functionName}] Starting...`);

  try {
    const scheduleGuard = shouldRunAtBangkokHour(req, 19);
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
      .select("job_id,customer_name,brand,model,product,appointment_date,production_status,assigned_mechanic_username,updated_at")
      .limit(500);
    if (bookingsError) throw bookingsError;

    const { data: ordersRaw, error: ordersError } = await supabase
      .from("orders")
      .select("order_id,customer_name,brand,model,items,due_date,status,assigned_mechanic_username,updated_at")
      .limit(500);
    if (ordersError) throw ordersError;

    const bookings = (bookingsRaw ?? []) as BookingSummaryRow[];
    const orders = (ordersRaw ?? []) as OrderSummaryRow[];

    const overdueBookings = bookings.filter((booking) =>
      booking.appointment_date && booking.appointment_date < today && !isStopStatus(booking.production_status)
    );
    const activeBookings = bookings.filter((booking) => booking.production_status === "กำลังทำ");
    const doneBookingsToday = bookings.filter((booking) =>
      String(booking.production_status ?? "").includes("เสร็จ") && String(booking.updated_at ?? "").slice(0, 10) === today
    );

    const overdueOrders = orders.filter((order) =>
      order.due_date && order.due_date < today && !isStopStatus(order.status)
    );
    const activeOrders = orders.filter((order) => ["in_progress", "กำลังผลิต"].includes(String(order.status ?? "")));
    const doneOrdersToday = orders.filter((order) =>
      ["done", "completed", "เสร็จแล้ว"].includes(String(order.status ?? "")) &&
      String(order.updated_at ?? "").slice(0, 10) === today
    );

    const bookingOverdueLines = overdueBookings.slice(0, 20).map((booking) =>
      bookingLine(booking, `- ค้าง ${diffDays(booking.appointment_date ?? today)} วัน`)
    );
    const orderOverdueLines = overdueOrders.slice(0, 20).map((order) =>
      orderLine(order, `- เกินกำหนด ${diffDays(order.due_date ?? today)} วัน`)
    );

    const message = [
      `📊 <b>สรุปงานประจำวัน</b> (${formatDateThai(today)})`,
      "",
      heading("🔧 งานหน้าร้าน", settings.booking_mechanic_default || ""),
      "",
      `🔴 <b>ค้าง: ${overdueBookings.length} งาน</b>`,
      bookingOverdueLines.join("\n") || "  • ไม่มี",
      "",
      `🟡 <b>กำลังทำ: ${activeBookings.length} งาน</b>`,
      activeBookings.slice(0, 20).map((booking) =>
        bookingLine(booking)
      ).join("\n") || "  • ไม่มี",
      "",
      `✅ <b>เสร็จวันนี้: ${doneBookingsToday.length} งาน</b>`,
      doneBookingsToday.slice(0, 20).map((booking) =>
        bookingLine(booking)
      ).join("\n") || "  • ไม่มี",
      "",
      heading("📋 งานออเดอร์", settings.order_mechanic_default || ""),
      "",
      `🔴 <b>ค้าง: ${overdueOrders.length} งาน</b>`,
      orderOverdueLines.join("\n") || "  • ไม่มี",
      "",
      `🟡 <b>กำลังทำ: ${activeOrders.length} งาน</b>`,
      activeOrders.slice(0, 20).map((order) =>
        orderLine(order)
      ).join("\n") || "  • ไม่มี",
      "",
      `✅ <b>เสร็จวันนี้: ${doneOrdersToday.length} งาน</b>`,
      doneOrdersToday.slice(0, 20).map((order) =>
        orderLine(order)
      ).join("\n") || "  • ไม่มี",
      "",
      "═══════════════════════════",
      "📈 <b>สรุปรวม</b>",
      `• งานทั้งหมดที่ Active: ${overdueBookings.length + activeBookings.length + overdueOrders.length + activeOrders.length} งาน`,
      `• เสร็จวันนี้: ${doneBookingsToday.length + doneOrdersToday.length} งาน`,
      `• ค้าง (เกินกำหนด): ${overdueBookings.length + overdueOrders.length} งาน`,
    ].join("\n");

    const result = await sendTelegramMessage(chatId, message);
    return jsonResponse({ sent: Boolean(result?.ok), overdue: overdueBookings.length + overdueOrders.length });
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
