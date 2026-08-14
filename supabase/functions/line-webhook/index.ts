import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { verifyLineSignature, replyMessage, getProfile } from "../_shared/line.ts";
import { generateLineReply } from "../_shared/ai-providers.ts";
import { PostgresSessionStore } from "../_shared/line-session-store.ts";
import { PromptBasedAiAdapter } from "../_shared/vendor/line-oa-ai-module/adapters/ai-engine.ts";
import { LineOaWebhookHandler } from "../_shared/vendor/line-oa-ai-module/index.ts";
import { getCustomerContext } from "../_shared/customer-context.ts";

const LIFF_BOOKING_URL = "https://liff.line.me/2011076704-ESBn0cYe";
const LINE_AI_SYSTEM_PROMPT = [
  "คุณคือผู้ช่วยตอบแชทของร้าน KMO Rack Bar Custom (ร้านทำแร็ค/บาร์/แคชบาร์แต่งมอเตอร์ไซค์)",
  "ตอบสั้น กระชับ สุภาพ เป็นภาษาไทย",
  "ถ้าลูกค้าสนใจจองคิว ให้แนะนำลิงก์จองคิว: " + LIFF_BOOKING_URL,
  "ห้ามยืนยันว่าจองคิวสำเร็จ ห้ามอ้างว่าเช็ควันว่างให้ได้ - บอกให้กดลิงก์จองคิวเพื่อเช็ค/จองเองเท่านั้น",
  "ถ้าลูกค้าถามสถานะงาน/ออเดอร์ ให้ตอบจากข้อมูลในระบบด้านล่างเท่านั้น ห้ามเดาวันที่หรือสถานะเอง",
  "ถ้าไม่แน่ใจคำตอบ หรือไม่มีข้อมูลในระบบ ให้บอกว่าจะให้ทีมงานติดต่อกลับ",
].join("\n");

serve(async (req) => {
  try {
    const rawBody = await req.text();
    if (!(await verifyLineSignature(rawBody, req.headers.get("x-line-signature")))) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const events = JSON.parse(rawBody)?.events ?? [];
    const supabase = createServiceClient();
    let settings: Record<string, string> | null = null;
    let aiHandler: LineOaWebhookHandler | null = null;

    for (const event of events) {
      if (event.type === "follow") {
        const userId = event.source?.userId;
        if (!userId) continue;

        const profile = await getProfile(userId);
        const { error } = await supabase.from("customers").upsert(
          { line_uid: userId, platform: "line", name: profile?.displayName ?? "LINE User", phone: "" },
          { onConflict: "line_uid" },
        );
        if (error) console.error("[line-webhook] customers upsert failed", error);

        if (event.replyToken) {
          await replyMessage(event.replyToken, [{
            type: "text",
            text: `ยินดีต้อนรับสู่ KMO Rack Bar Custom!\nกดลิงก์นี้เพื่อจองคิวได้เลยครับ:\n${LIFF_BOOKING_URL}`,
          }]);
        }
        continue;
      }

      if (event.type === "message" && event.message?.type === "text") {
        settings ??= await getSettings(supabase);
        const rollout = settings.line_ai_rollout ?? "off";
        const isOwner = event.source?.userId === settings.line_ai_owner_uid;
        if (rollout === "all" || (rollout === "owner_only" && isOwner)) {
          aiHandler ??= new LineOaWebhookHandler(
            {
              channelAccessToken: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "",
              channelSecret: Deno.env.get("LINE_CHANNEL_SECRET") ?? "",
            },
            {
              stateStore: new PostgresSessionStore(supabase),
              aiAdapter: new PromptBasedAiAdapter(async ({ userMessage, session, history }) => {
                const customerContext = await getCustomerContext(supabase, session.userId);
                const systemPrompt = `${LINE_AI_SYSTEM_PROMPT}\n\n${customerContext}`;
                const { reply } = await generateLineReply({ userMessage, history, systemPrompt });
                return { reply };
              }, LINE_AI_SYSTEM_PROMPT),
              businessAdapter: {
                async onIntent(intent, data, session) {
                  console.log("[line-ai] intent detected", { intent, data, userId: session.userId });
                },
              },
            },
          );
          await aiHandler.processSingleEvent(event);
        }
        continue;
      }
    }

    return jsonResponse({ ok: true, handled: events.length });
  } catch (error) {
    console.error("[line-webhook] Error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
