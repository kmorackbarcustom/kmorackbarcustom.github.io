import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BOOKING_STATUS_BUTTONS, dateOnlyInBangkok, addDays, isStopStatus, ORDER_STATUS_BUTTONS } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { formatBookingFollowup, formatOrderFollowup } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { buildStatusKeyboard, ensureTelegramWebhook, sendTelegramMessage } from "../_shared/telegram.ts";

type BookingRow = {
  id: string | number;
  job_id: string;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  product: string | null;
  color: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  production_status: string | null;
  assigned_mechanic_username: string | null;
  last_followup_at: string | null;
  followup_count: number | null;
};

type OrderRow = {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  color: string | null;
  due_date: string | null;
  status: string | null;
  channel: string | null;
  created_at: string | null;
  assigned_mechanic_username: string | null;
  last_followup_at: string | null;
  followup_count: number | null;
};

function generatedOrderId(order: OrderRow): string {
  const prefix = String(order.channel ?? "").toLowerCase().includes("shopee") ? "SHP" : "ORD";
  const date = String(order.created_at ?? new Date().toISOString()).slice(0, 10).replaceAll("-", "");
  const suffix = order.id.replaceAll("-", "").slice(0, 4).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

function bangkokDateFromTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

serve(async (req) => {
  const functionName = "followup-check";
  console.log(`[${functionName}] Starting...`);

  try {
    const scheduleGuard = shouldRunAtBangkokHour(req, 9);
    if (scheduleGuard) return scheduleGuard;

    const supabase = createServiceClient();
    const settings = await getSettings(supabase);
    const chatId = settings.telegram_group_chat_id;
    if (!chatId) {
      return jsonResponse({ error: "telegram_group_chat_id is not configured" }, 400);
    }

    const webhookHealth = await ensureTelegramWebhook();
    console.log(`[${functionName}] Telegram webhook health`, webhookHealth);

    const intervalHours = Number(settings.followup_interval_hours || "24");
    const cutoffTime = Date.now() - intervalHours * 60 * 60 * 1000;
    const today = dateOnlyInBangkok();
    const bookingDueDate = addDays(today, -1);
    const orderDueDate = addDays(today, 1);

    const { data: bookingsRaw, error: bookingsError } = await supabase
      .from("bookings")
      .select("id,job_id,customer_name,brand,model,product,color,appointment_date,pickup_date,production_status,assigned_mechanic_username,followup_count,last_followup_at")
      .lte("appointment_date", bookingDueDate)
      .limit(1000);
    if (bookingsError) throw bookingsError;

    const { data: ordersRaw, error: ordersError } = await supabase
      .from("orders")
      .select("id,order_id,customer_name,brand,model,items,color,due_date,status,channel,created_at,assigned_mechanic_username,followup_count,last_followup_at")
      .lte("due_date", orderDueDate)
      .limit(1000);
    if (ordersError) throw ordersError;

    const bookings = ((bookingsRaw ?? []) as BookingRow[])
      .filter((booking) => Boolean(booking.job_id))
      .filter((booking) => !isStopStatus(booking.production_status))
      .filter((booking) => !booking.last_followup_at || new Date(booking.last_followup_at).getTime() < cutoffTime)
      .filter((booking) => bangkokDateFromTimestamp(booking.last_followup_at) !== today)
      .map((booking) => ({
        ...booking,
        assigned_mechanic_username: booking.assigned_mechanic_username || settings.booking_mechanic_default || null,
      }));

    const preparedOrders: Array<OrderRow & { order_id: string }> = [];
    for (const order of (ordersRaw ?? []) as OrderRow[]) {
      const orderId = order.order_id || generatedOrderId(order);
      if (!order.order_id) {
        const { error: generatedIdError } = await supabase
          .from("orders")
          .update({ order_id: orderId })
          .eq("id", order.id);
        if (generatedIdError) throw generatedIdError;
      }
      preparedOrders.push({ ...order, order_id: orderId });
    }

    const orders = preparedOrders
      .filter((order) => !isStopStatus(order.status))
      .filter((order) => !order.last_followup_at || new Date(order.last_followup_at).getTime() < cutoffTime)
      .filter((order) => bangkokDateFromTimestamp(order.last_followup_at) !== today)
      .map((order) => ({
        ...order,
        assigned_mechanic_username: order.assigned_mechanic_username || settings.order_mechanic_default || null,
      }));

    let bookingsSent = 0;
    let ordersSent = 0;

    for (const booking of bookings) {
      const questionText = formatBookingFollowup(booking);
      const message = await sendTelegramMessage(
        chatId,
        questionText,
        buildStatusKeyboard("booking", `id=${booking.id}`, BOOKING_STATUS_BUTTONS),
      );

      if (message?.ok && message.result) {
        const nextCount = Number(booking.followup_count ?? 0) + 1;
        await supabase.from("ai_followups").insert({
          record_type: "booking",
          record_id: String(booking.id),
          question_text: questionText,
          telegram_message_id: message.result.message_id,
          telegram_chat_id: message.result.chat.id,
          followup_round: nextCount,
        });
        await supabase.from("bookings").update({
          last_followup_at: new Date().toISOString(),
          followup_count: nextCount,
          assigned_mechanic_username: booking.assigned_mechanic_username,
        }).eq("id", booking.id);
        bookingsSent += 1;
      }
    }

    for (const order of orders) {
      const questionText = formatOrderFollowup(order);
      const message = await sendTelegramMessage(
        chatId,
        questionText,
        buildStatusKeyboard("order", `id=${order.id}`, ORDER_STATUS_BUTTONS),
      );

      if (message?.ok && message.result) {
        const nextCount = Number(order.followup_count ?? 0) + 1;
        await supabase.from("ai_followups").insert({
          record_type: "order",
          record_id: order.id,
          question_text: questionText,
          telegram_message_id: message.result.message_id,
          telegram_chat_id: message.result.chat.id,
          followup_round: nextCount,
        });
        await supabase.from("orders").update({
          last_followup_at: new Date().toISOString(),
          followup_count: nextCount,
          assigned_mechanic_username: order.assigned_mechanic_username,
        }).eq("id", order.id);
        ordersSent += 1;
      }
    }

    console.log(`[${functionName}] Done`, { bookingsSent, ordersSent });
    return jsonResponse({ bookings_count: bookingsSent, orders_count: ordersSent });
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
