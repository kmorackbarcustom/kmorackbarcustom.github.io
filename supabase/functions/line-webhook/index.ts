import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { verifyLineSignature, replyMessage, getProfile } from "../_shared/line.ts";
import { generateLineReply } from "../_shared/ai-providers.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { PostgresSessionStore } from "../_shared/line-session-store.ts";
import { PromptBasedAiAdapter } from "../_shared/vendor/line-oa-ai-module/adapters/ai-engine.ts";
import { LineOaWebhookHandler } from "../_shared/vendor/line-oa-ai-module/index.ts";
import { getCustomerContext } from "../_shared/customer-context.ts";

const LIFF_BOOKING_URL = "https://liff.line.me/2011076704-ESBn0cYe";
const CUSTOMER_ORDER_URL = "https://liff.line.me/2011076704-yZQMM5Wb";

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
  "ห้ามยืนยันว่าจองคิว/สั่งออเดอร์สำเร็จ ห้ามอ้างว่าเช็ควันว่างให้ได้ - บอกให้กดลิงก์ที่ถูกต้องเพื่อทำเองเท่านั้น",
  "ถ้าลูกค้าถามสถานะงาน/ออเดอร์ที่มีอยู่แล้ว ให้ตอบจากข้อมูลในระบบด้านล่างเท่านั้น ห้ามเดาวันที่หรือสถานะเอง",
  "ถ้าไม่แน่ใจคำตอบ หรือไม่มีข้อมูลในระบบ ให้บอกว่าจะให้ทีมงานติดต่อกลับ",
].join("\n");

type ShopFaq = { question: string; answer: string };
type MatchedProduct = { brand: string | null; model: string | null; name: string; price: number; category: string };

function buildSystemPrompt(
  settings: Record<string, string>,
  faqs: ShopFaq[],
  products: MatchedProduct[],
): string {
  const shopName = settings.shop_name || "ร้าน";
  const parts = [
    `คุณคือผู้ช่วยตอบแชทของ${shopName}${settings.shop_description ? ` (${settings.shop_description})` : ""}`,
  ];
  if (settings.shop_address) parts.push(`ที่อยู่/พื้นที่ให้บริการ: ${settings.shop_address}`);
  if (settings.shop_contact) parts.push(`ช่องทางติดต่อ: ${settings.shop_contact}`);
  if (settings.shop_hours) parts.push(`เวลาเปิด-ปิด: ${settings.shop_hours}`);
  parts.push(LINE_AI_SAFETY_RULES);
  if (settings.ai_persona_prompt) parts.push(settings.ai_persona_prompt);
  if (faqs.length > 0) {
    parts.push(
      ["คำถามที่พบบ่อยและคำตอบมาตรฐาน (ใช้ตอบถ้าลูกค้าถามตรงกับเรื่องนี้):", ...faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`)].join(
        "\n",
      ),
    );
  }
  if (products.length > 0) {
    parts.push(
      [
        "รายการสินค้า/ราคาที่ตรงกับข้อความลูกค้า (ตอบราคาจากตรงนี้เท่านั้น ห้ามเดาราคาสินค้าที่ไม่อยู่ในรายการนี้):",
        ...products.map((p) => `- ${[p.brand, p.model].filter(Boolean).join(" ")} ${p.name} (${p.category}): ${p.price.toLocaleString("th-TH")} บาท`),
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}

// ponytail: matches the exact phrase the system prompt above instructs the AI to say — that's the
// only way we can tell "AI punted to a human" apart from a normal answer, since there's no function-calling.
const NEEDS_STAFF_FOLLOWUP = "ทีมงานติดต่อกลับ";

async function notifyStaffOfUnansweredQuestion(
  supabase: ReturnType<typeof createServiceClient>,
  chatId: string,
  lineUid: string,
  question: string,
): Promise<void> {
  const { data: customer } = await supabase
    .from("customers")
    .select("name, phone")
    .eq("line_uid", lineUid)
    .maybeSingle();

  const who = customer?.name ? `${customer.name}${customer.phone ? ` (${customer.phone})` : ""}` : lineUid;
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
        const { error } = await supabase.from("customers").upsert(
          { line_uid: userId, platform: "line", name: profile?.displayName ?? "LINE User", phone: "" },
          { onConflict: "line_uid" },
        );
        if (error) console.error("[line-webhook] customers upsert failed", error);

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
        settings ??= await getSettings(supabase);
        const rollout = settings.line_ai_rollout ?? "off";
        const isOwner = event.source?.userId === settings.line_ai_owner_uid;
        if (rollout === "all" || (rollout === "owner_only" && isOwner)) {
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
              stateStore: new PostgresSessionStore(supabase),
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
                  const [customerContext, matchedProducts] = await Promise.all([
                    getCustomerContext(supabase, session.userId),
                    supabase.rpc("search_products", { customer_message: userMessage }).then(({ data, error }) => {
                      if (error) console.error("[line-ai] search_products failed", error);
                      return data ?? [];
                    }),
                  ]);
                  const systemPrompt = `${buildSystemPrompt(settings ?? {}, faqs ?? [], matchedProducts)}\n\n${customerContext}`;
                  const { reply } = await generateLineReply({ userMessage, history, systemPrompt });
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
