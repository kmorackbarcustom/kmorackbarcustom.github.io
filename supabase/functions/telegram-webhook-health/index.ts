import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsonResponse } from "../_shared/database.ts";
import { ensureTelegramWebhook } from "../_shared/telegram.ts";

serve(async (req) => {
  const functionName = "telegram-webhook-health";
  console.log(`[${functionName}] Starting...`);

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const result = await ensureTelegramWebhook();
    console.log(`[${functionName}] Done`, result);
    return jsonResponse(result);
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
