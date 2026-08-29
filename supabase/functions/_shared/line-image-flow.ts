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
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type ImageFlowResult = {
  reply: string;
  visionSuccess: boolean;
  replied: boolean;
  pushed: boolean;
};

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
export async function processImageConversation(
  deps: ImageFlowDeps,
  input: {
    userId: string;
    messageId: string;
    replyToken?: string;
    timestamp?: number;
  },
): Promise<ImageFlowResult> {
  const session = await deps.sessions.getSession(input.userId);
  const priorHistory = session.history.map((item) => ({
    role: item.role,
    content: item.content,
  }));
  let synthetic: string | null = null;
  let userHistoryAppended = false;

  try {
    const downloadStarted = Date.now();
    const image = await deps.downloadImage(input.messageId);
    const visionStarted = Date.now();
    const observation = await deps.analyzeImage(image);
    synthetic = deps.formatObservation(observation);
    deps.log?.("vision_success", {
      messageId: input.messageId,
      mimeType: image.mimeType,
      byteLength: image.byteLength,
      downloadMs: visionStarted - downloadStarted,
      visionMs: Date.now() - visionStarted,
    });

    await deps.sessions.appendHistory(input.userId, {
      role: "user",
      content: synthetic,
      timestamp: input.timestamp ?? Date.now(),
    });
    userHistoryAppended = true;
    const reply = await deps.generateReply({
      userMessage: synthetic,
      history: priorHistory,
    });
    await deps.sessions.appendHistory(input.userId, {
      role: "assistant",
      content: reply,
      timestamp: Date.now(),
    });
    const sent = await sendWithFallback(
      deps,
      input.userId,
      input.replyToken,
      reply,
    );
    return { reply, visionSuccess: true, ...sent };
  } catch (error) {
    const coded = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    deps.log?.("vision_failure", {
      messageId: input.messageId,
      errorClass: coded || (error instanceof Error ? error.name : typeof error),
    });
    await deps.notifyImageFailure(input.messageId, error).catch(() =>
      undefined
    );
    const placeholder = synthetic ??
      "[IMAGE_MESSAGE_UNREADABLE] ลูกค้าส่งรูป แต่ระบบ vision อ่านรูปไม่สำเร็จ";
    if (!userHistoryAppended) {
      await deps.sessions.appendHistory(input.userId, {
        role: "user",
        content: placeholder,
        timestamp: input.timestamp ?? Date.now(),
      }).catch(() => undefined);
    }
    await deps.sessions.appendHistory(input.userId, {
      role: "assistant",
      content: IMAGE_READ_FALLBACK,
      timestamp: Date.now(),
    }).catch(() => undefined);
    const sent = await sendWithFallback(
      deps,
      input.userId,
      input.replyToken,
      IMAGE_READ_FALLBACK,
    );
    return { reply: IMAGE_READ_FALLBACK, visionSuccess: false, ...sent };
  }
}
