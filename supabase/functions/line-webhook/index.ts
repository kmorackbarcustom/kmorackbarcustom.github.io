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
import type {
  ChatMessageHistory,
  ConversationState,
  SessionStore,
  UserSession,
} from "../_shared/vendor/line-oa-ai-module/core/types.ts";
import { upsertLineCustomer } from "../_shared/customer-context.ts";
import {
  aiReplyAllowed,
  claimLineDelivery,
  type DeliveryClaim,
  recordCustomerInboxMessage,
  releaseLineDelivery,
  startLineDeliveryHeartbeat,
} from "../_shared/line-inbox.ts";
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

async function getLineCustomerState(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
) {
  let result = await supabase.from("customers")
    .select("id, line_uid, paused_until, human_takeover")
    .eq("line_uid", lineUid)
    .maybeSingle();
  if (result.error) throw new Error("customer_mode_read_failed");
  if (!result.data) {
    const profile = await getProfile(lineUid).catch(() => null);
    await upsertLineCustomer(supabase, lineUid, profile?.displayName);
    result = await supabase.from("customers")
      .select("id, line_uid, paused_until, human_takeover")
      .eq("line_uid", lineUid)
      .maybeSingle();
  }
  if (result.error || !result.data) {
    throw new Error("customer_mode_unavailable");
  }
  return result.data;
}

function lineEventTimestamp(timestamp?: number): string {
  return Number.isFinite(timestamp) && Number(timestamp) > 0
    ? new Date(Number(timestamp)).toISOString()
    : new Date().toISOString();
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; name?: unknown };
    if (typeof value.code === "string") return value.code;
    if (typeof value.name === "string") return value.name;
  }
  return "unknown";
}

/**
 * The vendored text handler appends the user turn, the assistant turn and the state/context that
 * turn produced (webhook-handler.ts steps 2/4/6) *before* this function ever claims the delivery
 * lease. That recorded an answer the customer may never have received: a suppressed or busy turn
 * stayed in the session as if it had been delivered, and the next AI turn either believed the
 * question was already answered or, for a reschedule turn, resumed a question nobody was shown.
 *
 * This store holds every text-turn write in memory and applies it only once LINE confirms the
 * send (commit()); every other exit drops it. The user turn passes straight through - the customer
 * really did send it - and `setWebhookEventIds()` doubles as the per-event reset, so a held turn
 * can never leak into the next event of the same invocation.
 */
class DeliveryGatedSessionStore implements SessionStore {
  private pendingState: ConversationState | null = null;
  private pendingContext: Record<string, unknown> | null = null;
  private pendingAssistant: Array<{
    message: ChatMessageHistory;
    maxHistory: number;
  }> = [];

  constructor(private readonly store: PostgresSessionStore) {}

  setWebhookEventIds(eventIds: string[]): void {
    this.pendingState = null;
    this.pendingContext = null;
    this.pendingAssistant = [];
    this.store.setWebhookEventIds(eventIds);
  }

  get(userId: string): Promise<UserSession | null> {
    return this.store.get(userId);
  }

  set(_userId: string, session: UserSession, _ttlMs?: number): Promise<void> {
    this.pendingState = session.state;
    this.pendingContext = session.contextData ?? {};
    return Promise.resolve();
  }

  delete(userId: string): Promise<void> {
    return this.store.delete(userId);
  }

  appendHistoryAtomic(
    userId: string,
    message: ChatMessageHistory,
    maxHistory: number,
  ): Promise<UserSession> {
    if (message.role !== "assistant") {
      return this.store.appendHistoryAtomic(userId, message, maxHistory);
    }
    this.pendingAssistant.push({ message, maxHistory });
    return this.store.get(userId).then((session) =>
      session ?? {
        userId,
        state: "IDLE",
        contextData: {},
        history: [],
        lastInteraction: Date.now(),
      }
    );
  }

  /**
   * LINE accepted the send: only now does this turn become part of the conversation. State and
   * context are applied against a fresh read first, because `set` writes the whole row including
   * history - running it after the assistant append would drop the appended turn.
   */
  async commit(userId: string): Promise<void> {
    const pendingState = this.pendingState;
    const pendingContext = this.pendingContext;
    const pendingAssistant = this.pendingAssistant;
    this.pendingState = null;
    this.pendingContext = null;
    this.pendingAssistant = [];
    if (pendingState !== null || pendingContext !== null) {
      const current = await this.store.get(userId);
      if (current) {
        await this.store.set(userId, {
          ...current,
          state: pendingState ?? current.state,
          contextData: { ...current.contextData, ...(pendingContext ?? {}) },
          lastInteraction: Date.now(),
        });
      }
    }
    for (const entry of pendingAssistant) {
      await this.store.appendHistoryAtomic(
        userId,
        entry.message,
        entry.maxHistory,
      );
    }
  }
}

// A pending AI inbox row means "generated, not sent". When the delivery lease could not be taken
// (busy/error/not claimable) the row must say so, otherwise reconciliation reads a never-attempted
// send as an uncertain one.
async function suppressAiInboxMessage(
  supabase: ReturnType<typeof createServiceClient>,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.from("line_inbox_messages")
    .update({ delivery_status: "suppressed" })
    .eq("event_id", eventId)
    .eq("role", "ai");
  if (error) {
    console.error("[line-webhook] AI inbox suppression failed", {
      eventId,
      errorCode: errorCode(error),
    });
  }
}

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
      console.error("[line-ai] staff notify failed", {
        errorCode: errorCode(notifyError),
      });
    }
  };

  try {
    const systemPrompt = buildLineSystemPrompt(settings, faqs);
    const authoritativeToolResults: string[] = [];
    const baseRunner = makeLineAgentRunner(supabase, userId);
    const { reply, provider } = await generateLineReplyAgent({
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
        reason: guarded.reason,
      });
    }
    await notifyIfNeeded(guarded.text);
    console.log("[line-ai] reply generated", {
      provider,
      replyLength: guarded.text.length,
      grounded: !guarded.blocked,
    });
    return guarded.text;
  } catch (error) {
    console.error("[line-ai] generation failed, sending fallback reply", {
      errorCode: errorCode(error),
    });
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
    let textSessionStore: DeliveryGatedSessionStore | null = null;

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
        const userId = event.source.userId;
        const eventId = lineEventKey(event);
        if (!eventId) throw new Error("text_event_id_missing");
        const claim = await claimLineWebhookEvent(
          supabase,
          eventId,
          "message:text",
        );
        if (!claim.claimed) continue;

        let customer;
        try {
          customer = await getLineCustomerState(supabase, userId);
          const record = await recordCustomerInboxMessage(supabase, {
            customerId: customer.id,
            eventId,
            lineMessageId: event.message.id ?? eventId,
            messageType: "text",
            content: event.message.text,
            createdAt: lineEventTimestamp(event.timestamp),
          });
          if (record === "duplicate-message") {
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "completed",
              "not_attempted",
              "duplicate_message",
            );
            continue;
          }
        } catch (error) {
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "failed_retryable",
            "not_attempted",
            "inbox_record_failed",
          ).catch(() => undefined);
          throw error;
        }

        settings ??= await getSettings(supabase);
        const rollout = settings.line_ai_rollout ?? "off";
        const isOwner = userId === settings.line_ai_owner_uid;
        if (
          !aiReplyAllowed(customer, null) ||
          !(rollout === "all" || (rollout === "owner_only" && isOwner))
        ) {
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "completed",
            "not_attempted",
          );
          continue;
        }

        if (faqs === null) {
          const { data, error } = await supabase.from("shop_faqs").select(
            "question, answer",
          ).order("sort_order");
          if (error) {
            console.error("[line-webhook] shop_faqs lookup failed", {
              errorCode: errorCode(error),
            });
          }
          faqs = data ?? [];
        }

        if (!textSessionStore) {
          textSessionStore = new DeliveryGatedSessionStore(
            new PostgresSessionStore(
              supabase,
              (Number(settings?.session_ttl_hours) || 6) * 60 * 60 * 1000,
            ),
          );
        }
        const gatedSessionStore = textSessionStore;
        gatedSessionStore.setWebhookEventIds([eventId]);
        aiHandler ??= new LineOaWebhookHandler(
          {
            channelAccessToken: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
              "",
            channelSecret: Deno.env.get("LINE_CHANNEL_SECRET") ?? "",
          },
          {
            stateStore: gatedSessionStore,
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
              onIntent(intent) {
                console.log("[line-ai] intent detected", {
                  intent,
                });
                return Promise.resolve();
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
          const aiText = result.replyMessages
            .flatMap((message) =>
              "text" in message && typeof message.text === "string"
                ? [message.text]
                : []
            )
            .join("\n");
          if (aiText) {
            const { error: inboxError } = await supabase.from(
              "line_inbox_messages",
            ).upsert({
              customer_id: customer.id,
              event_id: eventId,
              role: "ai",
              message_type: "text",
              content: aiText,
              delivery_status: "pending",
            }, { onConflict: "event_id,role" });
            if (inboxError) {
              // Nothing was sent: the row that says "generated, not sent" never landed, so the
              // event must stay retryable instead of processing forever.
              console.error("[line-webhook] AI inbox record failed", {
                eventId,
                errorCode: errorCode(inboxError),
              });
              await writeLineWebhookEventState(
                supabase,
                [eventId],
                "failed_retryable",
                "not_attempted",
                "inbox_record_failed",
              ).catch(() => undefined);
              throw new Error("ai_message_record_failed");
            }
          }

          let deliveryClaim: DeliveryClaim;
          try {
            deliveryClaim = await claimLineDelivery(
              supabase,
              customer.id,
              eventId,
              "ai",
            );
          } catch (error) {
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "failed_retryable",
              "not_attempted",
              "delivery_gate_failed",
            ).catch(() => undefined);
            if (aiText) await suppressAiInboxMessage(supabase, eventId);
            throw error;
          }
          if (deliveryClaim.status !== "claimed") {
            // The reply was generated but no send was attempted, so its inbox row cannot stay
            // `pending` - reconciliation would read it as an uncertain delivery.
            await suppressAiInboxMessage(supabase, eventId);
            if (deliveryClaim.status === "busy") {
              await writeLineWebhookEventState(
                supabase,
                [eventId],
                "failed_retryable",
                "not_attempted",
                "delivery_busy",
              );
              throw new Error("ai_delivery_busy");
            }
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "completed",
              "not_attempted",
              deliveryClaim.status,
            );
            gatedSessionStore.setWebhookEventIds([]);
            continue;
          }

          const heartbeat = startLineDeliveryHeartbeat(
            supabase,
            customer.id,
            deliveryClaim.claimToken,
          );
          let delivery;
          try {
            delivery = await sendReplyOrPushFallback({
              eventIds: [eventId],
              replyToken: event.replyToken,
              sendReply: async (replyToken) =>
                await replyMessageWithOutcome(
                  replyToken,
                  result.replyMessages!,
                  heartbeat.signal,
                ),
              sendPush: async () =>
                await pushMessageWithOutcome(
                  event.source!.userId!,
                  result.replyMessages!,
                  heartbeat.signal,
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
          } finally {
            heartbeat.stop();
            await releaseLineDelivery(
              supabase,
              customer.id,
              deliveryClaim.claimToken!,
            ).catch(
              (error) => {
                console.error("[line-webhook] delivery lock release failed", {
                  errorCode: errorCode(error),
                });
              },
            );
          }
          if (aiText) {
            const { error: updateError } = await supabase.from(
              "line_inbox_messages",
            )
              .update({
                delivery_status: delivery.outcome === "not_attempted"
                  ? "suppressed"
                  : delivery.outcome,
              })
              .eq("event_id", eventId)
              .eq("role", "ai");
            if (updateError) {
              console.error("[line-webhook] AI inbox status update failed", {
                errorCode: errorCode(updateError),
              });
            }
          }
          // Only a send LINE actually accepted promotes the held turn into the conversation; a
          // rejected/uncertain/not_attempted turn stays out of the history the next AI turn reads.
          if (delivery.replied || delivery.pushed) {
            await gatedSessionStore.commit(userId).catch((commitError) => {
              console.error(
                "[line-webhook] delivered turn history commit failed",
                { eventId, errorCode: errorCode(commitError) },
              );
            });
          }
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
        gatedSessionStore.setWebhookEventIds([]);
        continue;
      }

      if (event.type === "message" && event.message?.type === "image") {
        if (event.source?.type !== "user") continue;
        const userId = event.source?.userId;
        if (!userId) continue;
        const eventId = lineEventKey(event);
        if (!eventId || !event.message.id) {
          throw new Error("image_event_id_missing");
        }
        const claim = await claimLineWebhookEvent(
          supabase,
          eventId,
          "message:image",
        );
        if (!claim.claimed) continue;

        let customer;
        try {
          customer = await getLineCustomerState(supabase, userId);
          const record = await recordCustomerInboxMessage(supabase, {
            customerId: customer.id,
            eventId,
            lineMessageId: event.message.id,
            messageType: "image",
            createdAt: lineEventTimestamp(event.timestamp),
          });
          if (record === "duplicate-message") {
            await writeLineWebhookEventState(
              supabase,
              [eventId],
              "completed",
              "not_attempted",
              "duplicate_message",
            );
            continue;
          }
        } catch (error) {
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "failed_retryable",
            "not_attempted",
            "inbox_record_failed",
          ).catch(() => undefined);
          throw error;
        }

        settings ??= await getSettings(supabase);
        const mainRollout = settings.line_ai_rollout ?? "off";
        const imageRollout = settings.line_ai_image_rollout ?? "off";
        const isOwner = userId === settings.line_ai_owner_uid;
        const imageAllowed = shouldHandleImage({
          sourceType: event.source?.type,
          mainRollout,
          imageRollout,
          isOwner,
          isPaused: !aiReplyAllowed(customer, null),
        });
        if (!imageAllowed) {
          await writeLineWebhookEventState(
            supabase,
            [eventId],
            "completed",
            "not_attempted",
          );
          continue;
        }

        if (faqs === null) {
          const { data, error } = await supabase.from("shop_faqs").select(
            "question, answer",
          ).order("sort_order");
          if (error) {
            console.error("[line-webhook] shop_faqs lookup failed", {
              errorCode: errorCode(error),
            });
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
          console.error("[line-image] batch append failed", {
            errorCode: errorCode(appendError),
          });
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
          console.error("[line-image] batch claim failed", {
            errorCode: errorCode(claimError),
          });
          throw claimError;
        }
        type QueuedImageItem = {
          message_id: string;
          webhook_event_id: string | null;
          reply_token: string | null;
          timestamp: number;
          provider_type: string | null;
        };
        // claim keeps the v48 contract (plain items array) so old/new code and DB can overlap.
        const queuedItems = (claimedItems ?? []) as QueuedImageItem[];
        const claimedEventIds = queuedItems
          .map((it) => it.webhook_event_id)
          .filter((id): id is string =>
            typeof id === "string" && id.length > 0
          );
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
        const deliveryEventId = claimedEventIds[0] ?? eventId;
        const deliveryState: {
          claim: DeliveryClaim | null;
          heartbeat: ReturnType<typeof startLineDeliveryHeartbeat> | null;
        } = { claim: null, heartbeat: null };
        let deliveryLocked = false;
        let result;
        try {
          result = await processImageBatchConversation({
            sessions: stateManager,
            downloadImage: async (messageId) => {
              if (
                !isSupportedLineImageProvider(
                  providerByMessageId.get(messageId),
                )
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
            generateReply: async ({ userMessage, history }) => {
              const text = await generateAgentText(
                supabase,
                settings ?? {},
                faqs ?? [],
                userId,
                userMessage,
                history,
              );
              const { error } = await supabase.from("line_inbox_messages")
                .upsert({
                  customer_id: customer.id,
                  event_id: deliveryEventId,
                  role: "ai",
                  message_type: "text",
                  content: text,
                  delivery_status: "pending",
                }, { onConflict: "event_id,role" });
              if (error) throw new Error("ai_message_record_failed");
              return text;
            },
            authorizeDelivery: async () => {
              try {
                deliveryState.claim = await claimLineDelivery(
                  supabase,
                  customer.id,
                  deliveryEventId,
                  "ai",
                );
              } catch {
                deliveryState.claim = { status: "error", claimToken: null };
                return false;
              }
              if (deliveryState.claim.status === "claimed") {
                deliveryLocked = true;
                deliveryState.heartbeat = startLineDeliveryHeartbeat(
                  supabase,
                  customer.id,
                  deliveryState.claim.claimToken,
                );
              } else {
                deliveryLocked = false;
              }
              return deliveryLocked;
            },
            sendReply: async (replyToken, text) =>
              await replyMessageWithOutcome(replyToken, [{
                type: "text",
                text,
              }], deliveryState.heartbeat?.signal),
            sendPush: async (to, text) =>
              await pushMessageWithOutcome(
                to,
                [{ type: "text", text }],
                deliveryState.heartbeat?.signal,
              ),
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
        } finally {
          if (deliveryLocked) {
            deliveryState.heartbeat?.stop();
            await releaseLineDelivery(
              supabase,
              customer.id,
              deliveryState.claim!.claimToken!,
            )
              .catch((error) => {
                console.error("[line-image] delivery lock release failed", {
                  errorCode: errorCode(error),
                });
              });
          }
        }
        const deliveryClaim = deliveryState.claim;
        if (
          deliveryClaim?.status === "busy" || deliveryClaim?.status === "error"
        ) {
          // Reply was generated and its inbox row is still `pending`, but authorizeDelivery
          // refused before any send - say so before the retry path reads it as uncertain.
          await suppressAiInboxMessage(supabase, deliveryEventId);
          await writeLineWebhookEventState(
            supabase,
            claimedEventIds,
            "failed_retryable",
            "not_attempted",
            "delivery_gate_unavailable",
          );
          if (deliveryClaim.status === "busy") {
            throw new Error("ai_delivery_busy");
          }
          throw new Error("ai_delivery_gate_failed");
        }
        if (deliveryClaim?.status !== "claimed") {
          await suppressAiInboxMessage(supabase, deliveryEventId);
          await writeLineWebhookEventState(
            supabase,
            claimedEventIds,
            "completed",
            "not_attempted",
            deliveryClaim?.status ?? "delivery_not_claimed",
          );
          continue;
        }
        const { error: inboxError } = await supabase.from("line_inbox_messages")
          .upsert({
            customer_id: customer.id,
            event_id: deliveryEventId,
            role: "ai",
            message_type: "text",
            content: result.reply,
            delivery_status: result.deliveryOutcome === "not_attempted"
              ? "suppressed"
              : result.deliveryOutcome,
          }, { onConflict: "event_id,role" });
        if (inboxError) {
          console.error("[line-image] AI inbox status update failed", {
            errorCode: errorCode(inboxError),
          });
        }
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
    console.error("[line-webhook] request failed", {
      errorCode: errorCode(error),
    });
    return jsonResponse({ error: "webhook_failed" }, 500);
  }
});
