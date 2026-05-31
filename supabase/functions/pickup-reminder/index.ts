import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { addDays, dateOnlyInBangkok, isStopStatus } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { formatPickupReminder } from "../_shared/formatters.ts";
import { shouldRunAtBangkokHour } from "../_shared/schedule.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";

serve(async (req) => {
  const functionName = "pickup-reminder";
  console.log(`[${functionName}] Starting...`);

  try {
    const scheduleGuard = shouldRunAtBangkokHour(req, 18);
    if (scheduleGuard) return scheduleGuard;

    const supabase = createServiceClient();
    const settings = await getSettings(supabase);
    const chatId = settings.telegram_group_chat_id;
    if (!chatId) {
      return jsonResponse({ error: "telegram_group_chat_id is not configured" }, 400);
    }

    const tomorrow = addDays(dateOnlyInBangkok(), 1);
    const { data, error } = await supabase
      .from("bookings")
      .select("job_id,customer_name,phone,brand,model,product,pickup_date,production_status,assigned_mechanic_username")
      .eq("pickup_date", tomorrow)
      .limit(100);
    if (error) throw error;

    let sent = 0;
    for (const booking of data ?? []) {
      if (isStopStatus(booking.production_status)) continue;
      const message = formatPickupReminder({
        ...booking,
        color: null,
        appointment_date: null,
        assigned_mechanic_username: booking.assigned_mechanic_username || settings.booking_mechanic_default,
      }, tomorrow);

      const result = await sendTelegramMessage(chatId, message);
      if (result?.ok) sent += 1;
    }

    console.log(`[${functionName}] Done`, { sent });
    return jsonResponse({ count: sent, reminder_date: tomorrow });
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
