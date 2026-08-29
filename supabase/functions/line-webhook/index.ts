import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { verifyLineSignature, replyMessage, getProfile } from "../_shared/line.ts";
import { generateLineReplyAgent } from "../_shared/ai-providers.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { PostgresSessionStore } from "../_shared/line-session-store.ts";
import { PromptBasedAiAdapter } from "../_shared/vendor/line-oa-ai-module/adapters/ai-engine.ts";
import { LineOaWebhookHandler } from "../_shared/vendor/line-oa-ai-module/index.ts";
import { upsertLineCustomer } from "../_shared/customer-context.ts";
import { LINE_AGENT_TOOLS, makeLineAgentRunner } from "../_shared/line-agent-tools.ts";
import { CUSTOMER_ORDER_URL, LIFF_BOOKING_URL } from "../_shared/constants.ts";

// Safety-critical rules that stay hardcoded, not editable from admin-shop-config.html:
// wrong link or a false "booking confirmed" promise is a real customer-facing failure,
// and NEEDS_STAFF_FOLLOWUP below keys off the exact "ทีมงานติดต่อกลับ" phrasing here.
const LINE_AI_SAFETY_RULES = [
  "ตอบสั้น กระชับ สุภาพ เป็นภาษาไทย",
  "มี 2 ลิงก์ที่ใช้แนะนำลูกค้าได้ ห้ามสับสนกัน:",
  `- ลิงก์ "จองคิวเข้าร้าน" (ลูกค้าต้องเอารถเข้ามาที่ร้าน): ${LIFF_BOOKING_URL}`,
  `- ลิงก์ "สั่งผลิต/สั่งซื้ออุปกรณ์" (ไม่ต้องเอารถเข้าร้าน กรอกข้อมูลแล้วส่งของ/นัดติดตั้งทีหลัง): ${CUSTOMER_ORDER_URL}`,
  "ถ้าลูกค้าอยากจองคิวเข้าร้าน ให้แนะนำลิงก์จองคิว",
  "ถ้าลูกค้าอยากสั่งผลิต/สั่งซื้อของใหม่ (ยังไม่มีออเดอร์เดิม) ให้แนะนำลิงก์สั่งผลิต",
  "ถ้าลูกค้าแค่ถามข้อมูลทั่วไป (เช่น มีรุ่นอะไรบ้าง, ราคาเท่าไหร่, มีของไหม) ให้ตอบข้อมูลนั้นเฉยๆ ห้ามแนบลิงก์ทันที - แนบลิงก์เฉพาะตอนที่ลูกค้าแสดงเจตนาจะจอง/สั่งซื้อจริงๆ หรือถามเองว่าจะจอง/สั่งยังไงเท่านั้น",
  "ห้ามยืนยันว่าจองคิว/สั่งออเดอร์สำเร็จ ห้ามอ้างว่าเช็ควันว่างให้ได้ - บอกให้กดลิงก์ที่ถูกต้องเพื่อทำเองเท่านั้น",
  "ถ้าลูกค้าถามสถานะงาน/ออเดอร์ที่มีอยู่แล้ว ให้เรียก tool get_order_status แล้วตอบจากผลที่ได้เท่านั้น ห้ามเดาวันที่หรือสถานะเอง",
  "ห้ามแต่ง URL/ลิงก์แผนที่/เบอร์โทรขึ้นเองเด็ดขาด นอกจาก 2 ลิงก์ข้างบนและข้อมูลที่ให้ไว้จริง ถ้าลูกค้าขอแผนที่/โลเคชั่นแต่ไม่มีลิงก์แผนที่จริงในข้อมูล ให้บอกที่อยู่เป็นข้อความ แล้วแนะนำให้ค้นชื่อร้านใน Google Maps ห้ามส่งลิงก์สมมติ",
  "ถ้าลูกค้าบอกว่าเคยโทร/จองไปแล้วแต่ในระบบไม่มีข้อมูลตรงกัน ห้ามตอบราวกับลูกค้ายังไม่เคยจอง (เช่น ห้ามยื่นลิงก์จองคิวให้กดใหม่ทันที) ให้ตอบแบบคนกำลังเช็คให้ก่อน เช่น 'รอแป๊บนะครับ เดี๋ยวเช็คให้ว่ามีคนโทรมาจองไว้ไหม' แล้วแจ้งว่าจะให้ทีมงานยืนยันให้อีกที",
  "ถ้าไม่แน่ใจคำตอบ หรือไม่มีข้อมูลในระบบ ให้บอกว่าจะให้ทีมงานติดต่อกลับ พร้อมขอชื่อ-เบอร์โทรลูกค้าถ้ายังไม่มีในระบบ เพื่อให้ทีมงานตามได้เร็วขึ้น",
  "ถ้าลูกค้าพิมพ์รายละเอียดเพิ่มเติมในข้อความถัดไป (เช่น วันที่ เวลา รุ่นรถ) ห้ามตอบข้อความเดิมซ้ำคำต่อคำ ให้รับทราบรายละเอียดใหม่ก่อนแล้วค่อยแจ้งขั้นตอนถัดไป",
].join("\n");

type ShopFaq = { question: string; answer: string };

// Agent model reaches live data through the tools in line-agent-tools.ts, not through eager context
// stuffed here. This prompt is only the stable stuff: who you are, the safety rules, persona, FAQs.
function buildSystemPrompt(settings: Record<string, string>, faqs: ShopFaq[]): string {
  const shopName = settings.shop_name || "ร้าน";
  const today = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric", weekday: "long" });
  const parts = [
    `คุณคือผู้ช่วยตอบแชทของ${shopName}${settings.shop_description ? ` (${settings.shop_description})` : ""}`,
    // ponytail: without this, dates from tools (นัดรับ/กำหนดส่ง) read as inert strings with no
    // "now" to compare against - confirmed live, customer asked on their pickup day and the bot
    // answered as if the date were still upcoming.
    `วันนี้คือวัน${today} (เวลาไทย) — ใช้เทียบกับวันที่ที่เห็นจากข้อมูลลูกค้า/tool เสมอ`,
  ];
  if (settings.shop_address) parts.push(`ที่อยู่/พื้นที่ให้บริการ: ${settings.shop_address}`);
  if (settings.shop_contact) parts.push(`ช่องทางติดต่อ: ${settings.shop_contact}`);
  if (settings.shop_hours) parts.push(`เวลาเปิด-ปิด: ${settings.shop_hours}`);
  parts.push(LINE_AI_SAFETY_RULES);
  parts.push(
    [
      "เครื่องมือที่เรียกได้ (เรียกเมื่อจำเป็นเท่านั้น ไม่ต้องเรียกทุกข้อความ):",
      "- search_products: ถามราคา/รุ่น/มีของไหม",
      "- get_order_status: ลูกค้าถามสถานะงาน/ออเดอร์ของตัวเอง — เรียกทันที ห้ามขอเบอร์โทรก่อน (ระบบรู้ตัวตนลูกค้าจาก LINE อยู่แล้ว) ขอเบอร์เฉพาะตอน tool คืนว่าไม่พบข้อมูล",
      "- check_queue: ลูกค้าถามว่าคิวแน่นไหม สั่งตอนนี้นานไหม",
      "ห้ามเดาราคา สถานะงาน หรือความแน่นของคิวเอง ต้องเรียก tool ก่อนเสมอ ถ้า tool ไม่คืนข้อมูลให้บอกว่าจะให้ทีมงานติดต่อกลับ",
    ].join("\n"),
  );
  if (settings.ai_persona_prompt) parts.push(settings.ai_persona_prompt);
  if (faqs.length > 0) {
    parts.push(
      ["คำถามที่พบบ่อยและคำตอบมาตรฐาน (ใช้ตอบถ้าลูกค้าถามตรงกับเรื่องนี้):", ...faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`)].join("\n"),
    );
  }
  return parts.join("\n\n");
}

// Matches the exact phrase the safety rules tell the AI to say when it can't answer - the only
// signal we have that "AI punted to a human", since the reply is plain text with no structured flag.
const NEEDS_STAFF_FOLLOWUP = "ทีมงานติดต่อกลับ";

async function notifyStaffOfUnansweredQuestion(
  supabase: ReturnType<typeof createServiceClient>,
  chatId: string,
  lineUid: string,
  question: string,
): Promise<void> {
  const { data: customer } = await supabase
    .from("customers")
    .select("name, line_display_name, phone")
    .eq("line_uid", lineUid)
    .maybeSingle();

  const displayName = [customer?.name, customer?.line_display_name && customer.line_display_name !== customer.name
    ? `LINE: ${customer.line_display_name}` : null].filter(Boolean).join(" / ");
  const who = displayName ? `${displayName}${customer?.phone ? ` (${customer.phone})` : ""}` : lineUid;
  await sendTelegramMessage(
    chatId,
    `🔔 AI ตอบลูกค้าไม่ได้ ต้องติดต่อกลับ\nลูกค้า: ${who}\nคำถาม: ${question}`,
  );
}

serve(async (req) => {
  try {
    const rawBody = await req.text();
    if (!(await verifyLineSignature(rawBody, req.headers.get("x-line-signature")))) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const events = JSON.parse(rawBody)?.events ?? [];
    const supabase = createServiceClient();
    let settings: Record<string, string> | null = null;
    let faqs: ShopFaq[] | null = null;
    let aiHandler: LineOaWebhookHandler | null = null;

    for (const event of events) {
      if (event.type === "follow") {
        const userId = event.source?.userId;
        if (!userId) continue;

        const profile = await getProfile(userId);
        await upsertLineCustomer(supabase, userId, profile?.displayName);

        if (event.replyToken) {
          settings ??= await getSettings(supabase);
          const shopName = settings.shop_name || "ร้าน";
          await replyMessage(event.replyToken, [{
            type: "text",
            text: `ยินดีต้อนรับสู่${shopName}!\nกดลิงก์นี้เพื่อจองคิวได้เลยครับ:\n${LIFF_BOOKING_URL}`,
          }]);
        }
        continue;
      }

      if (event.type === "message" && event.message?.type === "text") {
        // Bot only serves 1-1 customer chat, never group/room chats (e.g. internal
        // staff work-update groups the OA was added to) - skip entirely, no reply,
        // no customers upsert. Groups aren't customers and shouldn't get AI replies.
        if (event.source?.type !== "user") continue;

        settings ??= await getSettings(supabase);
        const rollout = settings.line_ai_rollout ?? "off";
        const isOwner = event.source?.userId === settings.line_ai_owner_uid;

        const { data: pauseRow } = await supabase
          .from("customers")
          .select("paused_until")
          .eq("line_uid", event.source?.userId)
          .maybeSingle();

        // Existing followers who never re-triggered a "follow" event (only new
        // followers get upserted above) had no customers row at all, so staff
        // could never find/pause them by name. Backfill on their first message.
        if (!pauseRow) {
          const profile = await getProfile(event.source?.userId);
          await upsertLineCustomer(supabase, event.source?.userId, profile?.displayName);
        }

        const isPaused = pauseRow?.paused_until && new Date(pauseRow.paused_until).getTime() > Date.now();

        if (!isPaused && (rollout === "all" || (rollout === "owner_only" && isOwner))) {
          if (faqs === null) {
            const { data, error } = await supabase.from("shop_faqs").select("question, answer").order("sort_order");
            if (error) console.error("[line-webhook] shop_faqs lookup failed", error);
            faqs = data ?? [];
          }
          aiHandler ??= new LineOaWebhookHandler(
            {
              channelAccessToken: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "",
              channelSecret: Deno.env.get("LINE_CHANNEL_SECRET") ?? "",
            },
            {
              stateStore: new PostgresSessionStore(
                supabase,
                (Number(settings?.session_ttl_hours) || 6) * 60 * 60 * 1000,
              ),
              aiAdapter: new PromptBasedAiAdapter(async ({ userMessage, session, history }) => {
                const notifyIfNeeded = async (replyText: string) => {
                  const chatId = settings?.telegram_group_chat_id;
                  if (!chatId || !replyText.includes(NEEDS_STAFF_FOLLOWUP)) return;
                  try {
                    await notifyStaffOfUnansweredQuestion(supabase, chatId, session.userId, userMessage);
                  } catch (notifyError) {
                    console.error("[line-ai] staff notify failed", notifyError);
                  }
                };

                try {
                  const systemPrompt = buildSystemPrompt(settings ?? {}, faqs ?? []);
                  const { reply } = await generateLineReplyAgent({
                    userMessage,
                    history,
                    systemPrompt,
                    tools: LINE_AGENT_TOOLS,
                    runTool: makeLineAgentRunner(supabase, session.userId),
                    maxRounds: 3,
                  });
                  await notifyIfNeeded(reply);
                  return { reply };
                } catch (error) {
                  // AI generation totally failed (primary + fallback, or context lookup) - never let the
                  // customer get silence. The vendored module swallows exceptions thrown from here
                  // internally with no reply sent, so this must return a normal reply, not re-throw.
                  console.error("[line-ai] generation failed, sending fallback reply", error);
                  const fallback = "ขอโทษครับ ระบบขัดข้องชั่วคราว รบกวนลองพิมพ์ใหม่อีกครั้ง หรือรอทีมงานติดต่อกลับครับ";
                  await notifyIfNeeded(fallback);
                  return { reply: fallback };
                }
              }, LINE_AI_SAFETY_RULES),
              businessAdapter: {
                async onIntent(intent, data, session) {
                  console.log("[line-ai] intent detected", { intent, data, userId: session.userId });
                },
              },
            },
          );
          const result = await aiHandler.processSingleEvent(event);
          // Reply-first: the handler already tried replyMessage (free, no quota). If that failed -
          // usually an expired/used replyToken because the agent loop ran long - fall back to push
          // (costs monthly quota) so the customer gets the answer instead of silence.
          if (result.eventType === "message" && !result.replied && result.replyMessages?.length && event.source?.userId) {
            console.warn("[line-webhook] reply failed, using push fallback", result.replyResult?.error);
            const pushResult = await aiHandler.getLineClient().pushMessage(event.source.userId, result.replyMessages);
            if (!pushResult.success) console.error("[line-webhook] push fallback also failed", pushResult.error);
          }
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
