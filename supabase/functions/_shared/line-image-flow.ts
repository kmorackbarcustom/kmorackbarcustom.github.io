import type { LineImageContent } from "./line.ts";
import type { VisionObservation } from "./vision.ts";

type HistoryItem = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
};

type ImageSession = { history: HistoryItem[] };
type SessionPort = {
  getSession(userId: string): Promise<ImageSession>;
  appendHistory(userId: string, message: HistoryItem): Promise<unknown>;
};

export type ImageEligibilityInput = {
  sourceType?: string;
  mainRollout: string;
  imageRollout: string;
  isOwner: boolean;
  isPaused: boolean;
};

function rolloutAllows(stage: string, isOwner: boolean): boolean {
  return stage === "all" || (stage === "owner_only" && isOwner);
}

export function shouldHandleImage(input: ImageEligibilityInput): boolean {
  return input.sourceType === "user" && !input.isPaused &&
    rolloutAllows(input.mainRollout, input.isOwner) &&
    rolloutAllows(input.imageRollout, input.isOwner);
}

export function isSupportedLineImageProvider(providerType?: string): boolean {
  return !providerType || providerType === "line";
}
export const IMAGE_READ_FALLBACK =
  "ขอโทษครับ ตอนนี้ผมอ่านรูปนี้ไม่สำเร็จ เดี๋ยวให้ทีมงานติดต่อกลับเพื่อช่วยตรวจให้นะครับ";

// One image event queued for batch processing - see line_image_batch_append/claim RPCs in
// migration 20260905130000. A burst of images from the same customer arriving within the
// debounce window is collapsed into a single call to processImageBatchConversation instead of
// one independent AI turn per image (which used to produce duplicate/near-identical replies and
// duplicate staff alerts under concurrent webhook invocations).
export type BatchImageItem = {
  messageId: string;
  replyToken?: string;
  timestamp?: number;
};

export type ImageFlowDeps = {
  sessions: SessionPort;
  downloadImage(messageId: string): Promise<LineImageContent>;
  analyzeImage(image: LineImageContent): Promise<VisionObservation>;
  formatObservation(observation: VisionObservation): string;
  generateReply(input: {
    userMessage: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<string>;
  sendReply(replyToken: string, text: string): Promise<boolean>;
  sendPush(userId: string, text: string): Promise<boolean>;
  notifyImageFailure(messageId: string, error: unknown): Promise<void>;
  notifyPaymentProof?(messageId: string, observation: VisionObservation): Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type ImageFlowResult = {
  reply: string;
  visionSuccess: boolean;
  replied: boolean;
  pushed: boolean;
};

export function isLikelyPaymentProof(observation: VisionObservation): boolean {
  const text = [observation.summary, ...observation.visible_text, ...observation.notable_details].join(" ");
  const strong = /(โอนเงินสำเร็จ|โอนสำเร็จ|รายการสำเร็จ|สลิป|payment\s*(?:successful|complete)|transfer\s*(?:successful|complete))/i.test(text);
  const provider = /(กสิกรไทย|K\+|กรุงไทย|ไทยพาณิชย์|SCB|ธนาคารกรุงเทพ|ttb|ทรูมันนี่|TrueMoney|พร้อมเพย์|PromptPay)/i.test(text);
  const transaction = /(จำนวน|ยอดเงิน|บาท|เลขที่รายการ|รหัสรายการ|transaction|amount)/i.test(text);
  return strong || (provider && transaction);
}

async function sendWithFallback(
  deps: ImageFlowDeps,
  userId: string,
  replyToken: string | undefined,
  text: string,
): Promise<{ replied: boolean; pushed: boolean }> {
  const replied = replyToken ? await deps.sendReply(replyToken, text) : false;
  if (replied) return { replied: true, pushed: false };
  const pushed = await deps.sendPush(userId, text);
  return { replied: false, pushed };
}

type VisionSuccess = { item: BatchImageItem; index: number; observation: VisionObservation };

export async function processImageBatchConversation(
  deps: ImageFlowDeps,
  input: { userId: string; items: BatchImageItem[] },
): Promise<ImageFlowResult> {
  const items = input.items;
  const total = items.length;
  const lastReplyToken = items[items.length - 1]?.replyToken;
  const lastTimestamp = items[items.length - 1]?.timestamp;

  let synthetic: string | null = null;
  let userHistoryAppended = false;

  try {
    const session = await deps.sessions.getSession(input.userId);
    const priorHistory = session.history.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const settled = await Promise.allSettled(
      items.map(async (item, index): Promise<VisionSuccess> => {
        const image = await deps.downloadImage(item.messageId);
        const observation = await deps.analyzeImage(image);
        deps.log?.("vision_success", {
          messageId: item.messageId,
          mimeType: image.mimeType,
          byteLength: image.byteLength,
        });
        return { item, index, observation };
      }),
    );

    const successes = settled
      .filter((r): r is PromiseFulfilledResult<VisionSuccess> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => a.index - b.index);
    const failureCount = settled.length - successes.length;

    if (failureCount > 0) {
      const firstFailure = settled.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      deps.log?.("vision_failure", {
        failedCount: failureCount,
        totalCount: total,
        errorClass: firstFailure?.reason instanceof Error
          ? firstFailure.reason.name
          : typeof firstFailure?.reason,
      });
    }

    if (successes.length === 0) {
      // Whole batch unreadable - notify staff exactly once for the batch, not once per image.
      await deps.notifyImageFailure(
        items[items.length - 1].messageId,
        (settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)
          ?.reason,
      ).catch(() => undefined);
      const placeholder = total > 1
        ? `[IMAGE_MESSAGE_UNREADABLE] ลูกค้าส่งรูป ${total} รูป แต่ระบบ vision อ่านไม่สำเร็จทั้งหมด`
        : "[IMAGE_MESSAGE_UNREADABLE] ลูกค้าส่งรูป แต่ระบบ vision อ่านรูปไม่สำเร็จ";
      await deps.sessions.appendHistory(input.userId, {
        role: "user",
        content: placeholder,
        timestamp: lastTimestamp ?? Date.now(),
      }).catch(() => undefined);
      await deps.sessions.appendHistory(input.userId, {
        role: "assistant",
        content: IMAGE_READ_FALLBACK,
        timestamp: Date.now(),
      }).catch(() => undefined);
      const sent = await sendWithFallback(deps, input.userId, lastReplyToken, IMAGE_READ_FALLBACK);
      return { reply: IMAGE_READ_FALLBACK, visionSuccess: false, ...sent };
    }

    // Payment-proof check runs before reply generation and notifies at most once per batch, so a
    // slip is flagged to staff even if the chat-reply step below fails for some reason.
    if (deps.notifyPaymentProof) {
      const paymentHit = successes.find(({ observation }) => isLikelyPaymentProof(observation));
      if (paymentHit) {
        await deps.notifyPaymentProof(paymentHit.item.messageId, paymentHit.observation).catch(
          (error) => {
            deps.log?.("payment_proof_notify_failure", {
              messageId: paymentHit.item.messageId,
              errorClass: error instanceof Error ? error.name : typeof error,
            });
          },
        );
      }
    }

    const blocks = successes.map(({ observation }, i) =>
      total > 1
        ? `[รูปที่ ${i + 1}/${total}]\n${deps.formatObservation(observation)}`
        : deps.formatObservation(observation)
    );
    if (failureCount > 0) {
      blocks.push(`[หมายเหตุ] มี ${failureCount} จาก ${total} รูปที่ระบบอ่านไม่สำเร็จ`);
    }
    synthetic = blocks.join("\n\n");

    await deps.sessions.appendHistory(input.userId, {
      role: "user",
      content: synthetic,
      timestamp: lastTimestamp ?? Date.now(),
    });
    userHistoryAppended = true;

    const reply = await deps.generateReply({ userMessage: synthetic, history: priorHistory });
    await deps.sessions.appendHistory(input.userId, {
      role: "assistant",
      content: reply,
      timestamp: Date.now(),
    });
    const sent = await sendWithFallback(deps, input.userId, lastReplyToken, reply);
    return { reply, visionSuccess: true, ...sent };
  } catch (error) {
    // Outer safety net: batching raised the blast radius of a mid-pipeline crash from "one image's
    // reply lost" to "the whole batch's reply lost" - so no matter where this throws (session
    // read, history append, reply generation, send), still try to get *a* reply to the customer
    // using the last item's reply token, same as the single-image path used to guarantee.
    const coded = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    deps.log?.("batch_failure", {
      itemCount: total,
      errorClass: coded || (error instanceof Error ? error.name : typeof error),
    });
    if (!userHistoryAppended) {
      await deps.sessions.appendHistory(input.userId, {
        role: "user",
        content: synthetic ??
          `[IMAGE_MESSAGE_UNREADABLE] ลูกค้าส่งรูป ${total} รูป แต่ระบบประมวลผลไม่สำเร็จ`,
        timestamp: lastTimestamp ?? Date.now(),
      }).catch(() => undefined);
    }
    await deps.sessions.appendHistory(input.userId, {
      role: "assistant",
      content: IMAGE_READ_FALLBACK,
      timestamp: Date.now(),
    }).catch(() => undefined);
    await deps.notifyImageFailure(items[items.length - 1].messageId, error).catch(() => undefined);
    const sent = await sendWithFallback(deps, input.userId, lastReplyToken, IMAGE_READ_FALLBACK)
      .catch(() => ({ replied: false, pushed: false }));
    return { reply: IMAGE_READ_FALLBACK, visionSuccess: false, ...sent };
  }
}
