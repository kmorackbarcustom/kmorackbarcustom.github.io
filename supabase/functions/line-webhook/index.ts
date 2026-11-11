import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createServiceClient,
  getSettings,
  jsonResponse,
} from "../_shared/database.ts";
import {
  downloadLineImageContent,
  getProfile,
  pushMessageWithOutcome,
  replyMessage,
  replyMessageWithOutcome,
  verifyLineSignature,
} from "../_shared/line.ts";
import { generateLineReplyAgent } from "../_shared/ai-providers.ts";
import {
  buildLineSystemPrompt,
  LINE_AI_SAFETY_RULES,
  NEEDS_STAFF_FOLLOWUP,
  type ShopFaq,
} from "../_shared/line-ai-prompt.ts";
import { sendReplyOrPushFallback } from "../_shared/line-delivery.ts";
import {
  claimLineWebhookEvent,
  lineEventKey,
  writeLineWebhookEventState,
} from "../_shared/line-webhook-event-store.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { PostgresSessionStore } from "../_shared/line-session-store.ts";
import { StateManager } from "../_shared/vendor/line-oa-ai-module/core/state-manager.ts";
import { PromptBasedAiAdapter } from "../_shared/vendor/line-oa-ai-module/adapters/ai-engine.ts";
import { LineOaWebhookHandler } from "../_shared/vendor/line-oa-ai-module/index.ts";
import { upsertLineCustomer } from "../_shared/customer-context.ts";
import {
  LINE_AGENT_TOOLS,
  makeLineAgentRunner,
} from "../_shared/line-agent-tools.ts";
import { LIFF_BOOKING_URL } from "../_shared/constants.ts";
import {
  analyzeImageWithGemma,
  formatVisionObservation,
} from "../_shared/vision.ts";
import {
  type BatchImageItem,
  isSupportedLineImageProvider,
  processImageBatchConversation,
  shouldHandleImage,
} from "../_shared/line-image-flow.ts";
import { processRescheduleMessage } from "../_shared/reschedule-state.ts";
import { guardGroundedOutput } from "../_shared/output-grounding.ts";

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

  const displayName = [
    customer?.name,
    customer?.line_display_name && customer.line_display_name !== customer.name
      ? `LINE: ${customer.line_display_name}`
      : null,
  ].filter(Boolean).join(" / ");
  const who = displayName
    ? `${displayName}${customer?.phone ? ` (${customer.phone})` : ""}`
    : lineUid;
  await sendTelegramMessage(
    chatId,
    `🔔 AI ตอบลูกค้าไม่ได้ ต้องติดต่อกลับ\nลูกค้า: ${who}\nคำถาม: ${question}`,
  );
}

async function notifyStaffOfPaymentProof(
  supabase: ReturnType<typeof createServiceClient>,
  chatId: string,
  lineUid: string,
  messageId: string,
): Promise<void> {
  const { data: customer } = await supabase.from("customers").select(
    "name, line_display_name, phone",
  ).eq("line_uid", lineUid).maybeSingle();
  const displayName = [
    customer?.name,
    customer?.line_display_name && customer.line_display_name !== customer.name
      ? `LINE: ${customer.line_display_name}`
      : null,
  ].filter(Boolean).join(" / ");
  const who = displayName
    ? `${displayName}${customer?.phone ? ` (${customer.phone})` : ""}`
    : lineUid;
  await sendTelegramMessage(
    chatId,
    `🧾 ลูกค้าส่งหลักฐานการชำระ/สลิป กรุณาตรวจสอบทันที\nลูกค้า: ${who}\nLINE messageId: ${messageId}\nหมายเหตุ: ระบบยังไม่ถือว่าชำระแล้วจนกว่าทีมงาน/DB จะยืนยัน`,
  );
}

async function notifyStaffOfRescheduleRequest(
  supabase: ReturnType<typeof createServiceClient>,
  chatId: string,
  lineUid: string,
  originalDate: string,
  requestedDate: string,
): Promise<void> {
  const { data: customer } = await supabase
    .from("customers")
    .select("name, line_display_name, phone")
    .eq("line_uid", lineUid)
    .maybeSingle();
  const displayName = [
    customer?.name,
    customer?.line_display_name && customer.line_display_name !== customer.name
      ? `LINE: ${customer.line_display_name}`
      : null,
  ].filter(Boolean).join(" / ");
  const who = displayName
    ? `${displayName}${customer?.phone ? ` (${customer.phone})` : ""}`
    : lineUid;
  await sendTelegramMessage(
    chatId,
    `📅 ลูกค้าขอเลื่อนคิว\nลูกค้า: ${who}\nวันนัดเดิม: ${originalDate}\nวันที่ต้องการ: ${requestedDate}\nกรุณาตรวจสอบและยืนยันกับลูกค้า`,
  );
}

// Debounce window for coalescing a burst of images from the same customer into one AI turn (see
// line_image_batch_append/claim RPCs, migration 20260905130000). Each image appends itself then
// waits this long; only the invocation whose append is still the newest one when it wakes up
// claims and processes the whole batch. p_max_wait_seconds bounds a long straggling burst so a
// batch can never wait indefinitely (well inside LINE's reply-token expiry either way).
const IMAGE_BATCH_DEBOUNCE_MS = 1500;
const IMAGE_BATCH_MAX_WAIT_SECONDS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AgentHistoryItem = { role: string; content: string };

async function generateAgentText(
  supabase: ReturnType<typeof createServiceClient>,
  settings: Record<string, string>,
  faqs: ShopFaq[],
  userId: string,
  userMessage: string,
  history: AgentHistoryItem[],
): Promise<string> {
  const notifyIfNeeded = async (replyText: string) => {
    const chatId = settings.telegram_group_chat_id;
    if (!chatId || !replyText.includes(NEEDS_STAFF_FOLLOWUP)) return;
    try {
      await notifyStaffOfUnansweredQuestion(
        supabase,
        chatId,
        userId,
        userMessage,
      );
    } catch (notifyError) {
      console.error("[line-ai] staff notify failed", notifyError);
    }
  };

  try {
    const systemPrompt = buildLineSystemPrompt(settings, faqs);
    const authoritativeToolResults: string[] = [];
    const baseRunner = makeLineAgentRunner(supabase, userId);
    const { reply } = await generateLineReplyAgent({
      userMessage,
      history,
      systemPrompt,
      tools: LINE_AGENT_TOOLS,
      runTool: async (name, args) => {
        const result = await baseRunner(name, args);
        if (name === "get_order_status") authoritativeToolResults.push(result);
        return result;
      },
      maxRounds: 3,
    });
    const guarded = guardGroundedOutput(reply, {
      userMessage,
      authoritativeToolResults,
    });
    if (guarded.blocked) {
      console.warn("[line-ai] output grounding blocked unsupported claim", {
        userId,
        reason: guarded.reason,
      });
    }
    await notifyIfNeeded(guarded.text);
    console.log(`[line-ai] reply for ${userId}: ${guarded.text.slice(0, 300)}`);
    return guarded.text;
  } catch (error) {
    console.error("[line-ai] generation failed, sending fallback reply", error);
    const fallback =
      "ขอโทษครับ ระบบขัดข้องชั่วคราว รบกวนลองพิมพ์ใหม่อีกครั้ง หรือรอทีมงานติดต่อกลับครับ";
    await notifyIfNeeded(fallback);
    return fallback;
  }
}

serve(async (req) => {
  try {
    const rawBody = await req.text();
    if (
      !(await verifyLineSignature(rawBody, req.headers.get("x-line-signature")))
    ) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const events = JSON.parse(rawBody)?.events ?? [];
    const supabase = createServiceClient();
    let settings: Record<string, string> | null = null;
    let faqs: ShopFaq[] | null = null;
    let aiHandler: LineOaWebhookHandler | null = null;
    let textSessionStore: PostgresSessionStore | null = null;

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
            text:
              `ยินดีต้อนรับสู่${shopName}!\nกดลิงก์นี้เพื่อจองคิวได้เลยครับ:\n${LIFF_BOOKING_URL}`,
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
          await upsertLineCustomer(
            supabase,
            event.source?.userId,
            profile?.displayName,
          );
        }

        const isPaused = pauseRow?.paused_until &&
          new Date(pauseRow.paused_until).getTime() > Date.now();

        if (
          !isPaused &&
          (rollout === "all" || (rollout === "owner_only" && isOwner))
        ) {
          if (faqs === null) {
            const { data, error } = await supabase.from("shop_faqs").select(
              "question, answer",
            ).order("sort_order");
            if (error) {
              console.error("[line-webhook] shop_faqs lookup failed", error);
            }
            faqs = data ?? [];
          }
          const eventId = lineEventKey(event);
          if (!eventId) {
            console.error(
              "[line-webhook] text event has no stable event or message ID",
            );
            throw new Error(
              "LINE text event is missing webhookEventId and message.id",
            );
          }
          const claim = await claimLineWebhookEvent(
            supabase,
            eventId,
            "message:text",
          );
          if (!claim.claimed) {
            console.log("[line-webhook] duplicate text event skipped", {
              eventId,
              status: claim.status,
              deliveryStatus: claim.deliveryStatus,
            });
            continue;
          }

          if (!textSessionStore) {
            textSessionStore = new PostgresSessionStore(
              supabase,
              (Number(settings?.session_ttl_hours) || 6) * 60 * 60 * 1000,
            );
          }
          textSessionStore.setWebhookEventIds([eventId]);
          aiHandler ??= new LineOaWebhookHandler(
            {
              channelAccessToken: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
                "",
              channelSecret: Deno.env.get("LINE_CHANNEL_SECRET") ?? "",
            },
            {
              stateStore: textSessionStore,
              autoReply: false,
              aiAdapter: new PromptBasedAiAdapter(
                async ({ userMessage, session, history }) => {
                  const reschedule = processRescheduleMessage(
                    session.contextData,
                    userMessage,
                  );
                  if (reschedule) {
                    if (reschedule.completed) {
                      const chatId = settings?.telegram_group_chat_id;
                      if (chatId) {
                        try {
                          await notifyStaffOfRescheduleRequest(
                            supabase,
                            chatId,
                            session.userId,
                            reschedule.completed.originalDate,
                            reschedule.completed.requestedDate,
                          );
                        } catch (notifyError) {
                          console.error(
                            "[line-ai] reschedule staff notify failed",
                            notifyError,
                          );
                        }
                      }
                    }
                    const guarded = guardGroundedOutput(reschedule.reply, {
                      userMessage,
                      structuredDates: {
                        original_date: reschedule.completed?.originalDate ??
                          reschedule.extractedData.original_date,
                        requested_date: reschedule.completed?.requestedDate ??
                          reschedule.extractedData.requested_date,
                      },
                    });
                    return { ...reschedule, reply: guarded.text };
                  }
                  return {
                    reply: await generateAgentText(
                      supabase,
                      settings ?? {},
                      faqs ?? [],
                      session.userId,
                      userMessage,
                      history,
                    ),
                  };
                },
                LINE_AI_SAFETY_RULES,
              ),
              businessAdapter: {
                async onIntent(intent, data, session) {
                  console.log("[line-ai] intent detected", {
                    intent,
                    data,
                    userId: session.userId,
                  });
                },
              },
            },
          );
          const result = await aiHandler.processSingleEvent(event);
          if (!result.success) {
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "failed_retryable",
              "not_attempted",
              "event_processing_failed",
            );
            throw new Error(
              result.error ?? "LINE text event processing failed",
            );
          }
          if (result.replyMessages?.length && event.source?.userId) {
            const delivery = await sendReplyOrPushFallback({
              eventIds: [eventId],
              replyToken: event.replyToken,
              sendReply: async (replyToken) =>
                await replyMessageWithOutcome(
                  replyToken,
                  result.replyMessages!,
                ),
              sendPush: async () =>
                await pushMessageWithOutcome(
                  event.source.userId!,
                  result.replyMessages!,
                ),
              writeState: (ids, status, deliveryStatus, errorCode) =>
                writeLineWebhookEventState(
                  supabase,
                  ids,
                  status,
                  deliveryStatus,
                  errorCode,
                ),
            });
            if (
              delivery.outcome === "uncertain" ||
              delivery.outcome === "rejected"
            ) {
              console.warn("[line-webhook] text delivery needs follow-up", {
                eventId,
                outcome: delivery.outcome,
              });
            }
          } else {
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "completed",
              "not_attempted",
            );
          }
          textSessionStore.setWebhookEventIds([]);
        }
        continue;
      }

      if (event.type === "message" && event.message?.type === "image") {
        if (event.source?.type !== "user") continue;
        const userId = event.source?.userId;
        if (!userId) continue;

        settings ??= await getSettings(supabase);
        const mainRollout = settings.line_ai_rollout ?? "off";
        const imageRollout = settings.line_ai_image_rollout ?? "off";
        const isOwner = userId === settings.line_ai_owner_uid;
        const { data: pauseRow } = await supabase
          .from("customers")
          .select("paused_until")
          .eq("line_uid", userId)
          .maybeSingle();
        if (!pauseRow) {
          const profile = await getProfile(userId);
          await upsertLineCustomer(supabase, userId, profile?.displayName);
        }
        const isPaused = Boolean(
          pauseRow?.paused_until &&
            new Date(pauseRow.paused_until).getTime() > Date.now(),
        );
        if (
          !shouldHandleImage({
            sourceType: event.source?.type,
            mainRollout,
            imageRollout,
            isOwner,
            isPaused,
          })
        ) continue;

        const eventId = lineEventKey(event);
        if (!eventId) {
          console.error("[line-image] event has no stable event or message ID");
          throw new Error(
            "LINE image event is missing webhookEventId and message.id",
          );
        }
        const claim = await claimLineWebhookEvent(
          supabase,
          eventId,
          "message:image",
        );
        if (!claim.claimed) {
          console.log("[line-image] duplicate image event skipped", {
            eventId,
            status: claim.status,
            deliveryStatus: claim.deliveryStatus,
          });
          continue;
        }

        if (faqs === null) {
          const { data, error } = await supabase.from("shop_faqs").select(
            "question, answer",
          ).order("sort_order");
          if (error) {
            console.error("[line-webhook] shop_faqs lookup failed", error);
          }
          faqs = data ?? [];
        }

        // Coalesce a burst of images from this customer into one AI turn instead of one
        // independent full pipeline run per image event (see migration 20260905130000 for why:
        // concurrent webhook invocations racing on the same session row used to produce
        // duplicate/near-identical replies and duplicate staff alerts). Every image appends
        // itself to a per-customer pending batch, then waits; only the invocation whose append
        // is still the newest one when it wakes up actually claims and processes the whole
        // batch - everyone else bails immediately, for free.
        const { data: appended, error: appendError } = await supabase.rpc(
          "line_image_batch_append",
          {
            p_line_uid: userId,
            p_message_id: event.message.id,
            p_reply_token: event.replyToken ?? null,
            p_event_timestamp: event.timestamp ?? Date.now(),
            p_provider_type: event.message?.contentProvider?.type ?? null,
            p_webhook_event_id: eventId,
          },
        );
        if (appendError || !appended) {
          console.error("[line-image] batch append failed", appendError);
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "failed_retryable",
            "not_attempted",
            "image_batch_append_failed",
          );
          throw appendError ??
            new Error("line_image_batch_append returned no row");
        }
        const batchEventIds = (appended.event_ids ?? []) as string[];
        if (!batchEventIds.includes(eventId)) {
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "completed",
            "not_attempted",
            "duplicate_image_message_id",
          );
          continue;
        }

        await sleep(IMAGE_BATCH_DEBOUNCE_MS);

        const { data: claimedItems, error: claimError } = await supabase.rpc(
          "line_image_batch_claim",
          {
            p_line_uid: userId,
            p_since: appended.updated_at,
            p_max_wait_seconds: IMAGE_BATCH_MAX_WAIT_SECONDS,
          },
        );
        if (claimError) {
          console.error("[line-image] batch claim failed", claimError);
          throw claimError;
        }
        type QueuedImageItem = {
          message_id: string;
          webhook_event_id: string | null;
          reply_token: string | null;
          timestamp: number;
          provider_type: string | null;
        };
        const claimedBatch = (claimedItems ?? null) as {
          items?: QueuedImageItem[];
          event_ids?: string[];
        } | null;
        const queuedItems = claimedBatch?.items ?? [];
        const claimedEventIds = claimedBatch?.event_ids ?? [];
        if (queuedItems.length === 0) {
          // Superseded: a newer image arrived while we were waiting, so that later invocation
          // owns the whole batch (including this image) instead of us. No vision/LLM cost paid.
          continue;
        }

        const providerByMessageId = new Map(
          queuedItems.map((
            it,
          ) => [it.message_id, it.provider_type ?? undefined]),
        );
        const batchItems: BatchImageItem[] = queuedItems.map((it) => ({
          messageId: it.message_id,
          webhookEventId: it.webhook_event_id ?? undefined,
          replyToken: it.reply_token ?? undefined,
          timestamp: it.timestamp,
        }));

        const ttlMs = (Number(settings.session_ttl_hours) || 6) * 60 * 60 *
          1000;
        const sessionStore = new PostgresSessionStore(supabase, ttlMs);
        sessionStore.setWebhookEventIds(claimedEventIds);
        const stateManager = new StateManager(
          sessionStore,
          ttlMs,
        );
        const result = await processImageBatchConversation({
          sessions: stateManager,
          downloadImage: async (messageId) => {
            if (
              !isSupportedLineImageProvider(providerByMessageId.get(messageId))
            ) {
              const error = new Error(
                "external image provider is not supported",
              ) as Error & { code?: string };
              error.code = "external_provider";
              throw error;
            }
            return await downloadLineImageContent(messageId);
          },
          analyzeImage: async (image) =>
            await analyzeImageWithGemma({
              bytes: image.bytes,
              mimeType: image.mimeType,
            }),
          formatObservation: formatVisionObservation,
          generateReply: async ({ userMessage, history }) =>
            await generateAgentText(
              supabase,
              settings ?? {},
              faqs ?? [],
              userId,
              userMessage,
              history,
            ),
          sendReply: async (replyToken, text) =>
            await replyMessageWithOutcome(replyToken, [{ type: "text", text }]),
          sendPush: async (to, text) =>
            await pushMessageWithOutcome(to, [{ type: "text", text }]),
          writeEventState: (ids, status, deliveryStatus, errorCode) =>
            writeLineWebhookEventState(
              supabase,
              ids,
              status,
              deliveryStatus,
              errorCode,
            ),
          notifyPaymentProof: async (messageId) => {
            const chatId = settings?.telegram_group_chat_id;
            if (!chatId) return;
            await notifyStaffOfPaymentProof(
              supabase,
              chatId,
              userId,
              messageId,
            );
          },
          notifyImageFailure: async (messageId) => {
            const chatId = settings?.telegram_group_chat_id;
            if (!chatId) return;
            await notifyStaffOfUnansweredQuestion(
              supabase,
              chatId,
              userId,
              `ลูกค้าส่งรูป (messageId: ${messageId}) แต่ระบบอ่านรูปไม่สำเร็จ`,
            );
          },
          log: (name, data) => console.log(`[line-image] ${name}`, data),
        }, { userId, items: batchItems });
        if (
          result.deliveryOutcome === "uncertain" ||
          result.deliveryOutcome === "rejected"
        ) {
          console.error("[line-image] delivery needs follow-up", {
            eventIds: claimedEventIds,
            messageIds: batchItems.map((it) => it.messageId),
            outcome: result.deliveryOutcome,
          });
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
