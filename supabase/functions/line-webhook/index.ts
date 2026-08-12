import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, jsonResponse } from "../_shared/database.ts";
import { verifyLineSignature, replyMessage } from "../_shared/line.ts";

const LIFF_BOOKING_URL = "https://liff.line.me/2011076704-ESBn0cYe";

serve(async (req) => {
  try {
    const rawBody = await req.text();
    if (!(await verifyLineSignature(rawBody, req.headers.get("x-line-signature")))) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const events = JSON.parse(rawBody)?.events ?? [];
    const supabase = createServiceClient();

    for (const event of events) {
      if (event.type !== "follow") continue; // message/unfollow: intentionally not handled in v1
      const userId = event.source?.userId;
      if (!userId) continue;

      const { error } = await supabase.from("customers").upsert(
        { line_uid: userId, platform: "line" },
        { onConflict: "line_uid" },
      );
      if (error) console.error("[line-webhook] customers upsert failed", error);

      if (event.replyToken) {
        await replyMessage(event.replyToken, [{
          type: "text",
          text: `ยินดีต้อนรับสู่ KMO Rack Bar Custom!\nกดลิงก์นี้เพื่อจองคิวได้เลยครับ:\n${LIFF_BOOKING_URL}`,
        }]);
      }
    }

    return jsonResponse({ ok: true, handled: events.length });
  } catch (error) {
    console.error("[line-webhook] Error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
