import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { addDays, dateOnlyInBangkok, isStopStatus } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { formatAppointmentReminderLine, formatAppointmentReminderStaffTelegram } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { pushMessage } from "../_shared/line.ts";

serve(async (req) => {
  try {
    const supabase = createServiceClient();
    const settings = await getSettings(supabase);
    const scheduleGuard = shouldRunAtBangkokHour(req, Number(settings.appointment_reminder_hour ?? 10));
    if (scheduleGuard) return scheduleGuard;

    const chatId = settings.telegram_group_chat_id;
    if (!chatId) return jsonResponse({ error: "telegram_group_chat_id is not configured" }, 400);

    const tomorrow = addDays(dateOnlyInBangkok(), 1);
    const { data, error } = await supabase
      .from("bookings")
      .select("id,job_id,customer_name,phone,brand,model,product,appointment_date,production_status,line_uid,assigned_mechanic_username")
      .eq("appointment_date", tomorrow)
      .limit(100);
    if (error) throw error;

    let lineSent = 0, telegramSent = 0;

    for (const booking of data ?? []) {
      if (isStopStatus(booking.production_status)) continue;

      const staffMsg = formatAppointmentReminderStaffTelegram(booking, tomorrow);
      const tgResult = await sendTelegramMessage(chatId, staffMsg);
      const tgOk = Boolean(tgResult?.ok);
      if (tgOk) telegramSent += 1;
      await supabase.from("notifications_log").insert({
        booking_id: booking.id,
        notification_type: "appointment_reminder_staff_telegram",
        message: staffMsg,
        sent_to: chatId,
        success: tgOk,
        error_message: tgOk ? null : tgResult?.description ?? "unknown",
      });

      if (booking.line_uid) {
        const lineMsg = formatAppointmentReminderLine(booking);
        const lineOk = await pushMessage(booking.line_uid, [{ type: "text", text: lineMsg }]);
        if (lineOk) lineSent += 1;
        await supabase.from("notifications_log").insert({
          booking_id: booking.id,
          notification_type: "appointment_reminder_line",
          message: lineMsg,
          sent_to: booking.line_uid,
          success: lineOk,
          error_message: lineOk ? null : "line push failed",
        });
      }
    }

    return jsonResponse({ line_sent: lineSent, telegram_sent: telegramSent, reminder_date: tomorrow });
  } catch (error) {
    console.error("[appointment-reminder] Error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
