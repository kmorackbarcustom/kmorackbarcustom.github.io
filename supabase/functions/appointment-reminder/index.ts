import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { addDays, dateOnlyInBangkok, isStopStatus } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { formatAppointmentReminderLine, formatAppointmentReminderStaffTelegram } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { pushMessage } from "../_shared/line.ts";

export const MAX_PAGES = 20;
export const MAX_PUSH_ATTEMPTS = 3;
type ReminderBooking = Parameters<typeof formatAppointmentReminderLine>[0] & {
  id: string | number;
  queue_status?: unknown;
};
let waitForRetry = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function setRetryWait(wait: (ms: number) => Promise<void>): void {
  waitForRetry = wait;
}

export function bookingUsesSlot(queueStatus: unknown, productionStatus: unknown): boolean {
  return (queueStatus == null || queueStatus !== "ยกเลิก") &&
    (productionStatus == null || productionStatus !== "ยกเลิก");
}

export async function retryLinePush(
  send: () => Promise<boolean>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
    if (await send()) return true;
    if (attempt < MAX_PUSH_ATTEMPTS) await wait(500 * 2 ** (attempt - 1));
  }
  return false;
}

export const handler = async (req: Request) => {
  try {
    const supabase = createServiceClient();
    const settings = await getSettings(supabase);
    const scheduleGuard = shouldRunAtBangkokHour(req, Number(settings.appointment_reminder_hour ?? 10));
    if (scheduleGuard) return scheduleGuard;

    const chatId = settings.telegram_group_chat_id;
    if (!chatId) return jsonResponse({ error: "telegram_group_chat_id is not configured" }, 400);

    const tomorrow = addDays(dateOnlyInBangkok(), 1);
    const logTypes = [
      `appointment_reminder_staff_telegram:${tomorrow}`,
      `appointment_reminder_line:${tomorrow}`,
    ];
    let lineSent = 0, telegramSent = 0, skippedCancelled = 0, skippedDuplicate = 0, lineFailed = 0;
    let truncated = false;
    const pages: { bookings: ReminderBooking[]; sent: Set<string> }[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * 100;
      const { data, error } = await supabase
        .from("bookings")
        .select("id,job_id,customer_name,phone,brand,model,product,appointment_date,production_status,queue_status,line_uid,assigned_mechanic_username")
        .eq("appointment_date", tomorrow)
        .order("id", { ascending: true })
        .range(from, from + 99);
      if (error) throw error;
      const bookings = (data ?? []) as ReminderBooking[];
      if (!bookings.length) break;
      if (page === MAX_PAGES - 1) {
        if (bookings.length === 100) {
          truncated = true;
          console.error(`[appointment-reminder] Page limit reached (${MAX_PAGES})`);
        }
      }

      const bookingIds = bookings.map((booking) => booking.id).filter((id) => id != null);
      const { data: logs, error: logError } = await supabase
        .from("notifications_log")
        .select("booking_id,notification_type")
        .in("booking_id", bookingIds)
        .in("notification_type", logTypes)
        .eq("success", true);
      if (logError) throw logError;
      const sent = new Set((logs ?? []).map((log) => `${log.booking_id}:${log.notification_type}`));
      pages.push({ bookings, sent });
      if (bookings.length < 100) break;
    }

    for (const { bookings, sent } of pages) {
      for (const booking of bookings) {
        if (!bookingUsesSlot(booking.queue_status, booking.production_status) ||
          isStopStatus(booking.production_status) || isStopStatus(booking.queue_status)) {
          skippedCancelled += 1;
          continue;
        }

        const tgType = `appointment_reminder_staff_telegram:${tomorrow}`;
        if (sent.has(`${booking.id}:${tgType}`)) skippedDuplicate += 1;
        else {
          const staffMsg = formatAppointmentReminderStaffTelegram(booking, tomorrow);
          const tgResult = await sendTelegramMessage(chatId, staffMsg);
          const tgOk = Boolean(tgResult?.ok);
          if (tgOk) telegramSent += 1;
          try {
            const { error: writeError } = await supabase.from("notifications_log").insert({
              booking_id: booking.id,
              notification_type: tgType,
              message: staffMsg,
              sent_to: chatId,
              success: tgOk,
              error_message: tgOk ? null : tgResult?.description ?? "unknown",
            });
            if (writeError) console.error("[appointment-reminder] Telegram log insert failed", writeError);
          } catch (writeError) {
            console.error("[appointment-reminder] Telegram log insert failed", writeError);
          }
          if (tgOk) sent.add(`${booking.id}:${tgType}`);
        }

        if (booking.line_uid) {
          const lineType = `appointment_reminder_line:${tomorrow}`;
          if (sent.has(`${booking.id}:${lineType}`)) {
            skippedDuplicate += 1;
            continue;
          }
          const lineMsg = formatAppointmentReminderLine(booking);
          const lineOk = await retryLinePush(() => pushMessage(booking.line_uid as string, [{ type: "text", text: lineMsg }]), waitForRetry);
          if (lineOk) lineSent += 1;
          else lineFailed += 1;
          try {
            const { error: writeError } = await supabase.from("notifications_log").insert({
              booking_id: booking.id,
              notification_type: lineType,
              message: lineMsg,
              sent_to: booking.line_uid,
              success: lineOk,
              error_message: lineOk ? null : "line push failed",
            });
            if (writeError) console.error("[appointment-reminder] LINE log insert failed", writeError);
          } catch (writeError) {
            console.error("[appointment-reminder] LINE log insert failed", writeError);
          }
        }
      }
    }

    return jsonResponse({ line_sent: lineSent, telegram_sent: telegramSent, reminder_date: tomorrow,
      skipped_cancelled: skippedCancelled, skipped_duplicate: skippedDuplicate, line_failed: lineFailed, truncated });
  } catch (error) {
    console.error("[appointment-reminder] Error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
};

serve(handler);
