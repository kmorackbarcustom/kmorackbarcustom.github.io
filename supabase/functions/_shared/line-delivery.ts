export type LineDeliveryOutcome = "accepted" | "rejected" | "uncertain";

export type LineSendResult = {
  outcome: LineDeliveryOutcome;
  statusCode?: number;
  error?: string;
};

export type LineEventStatus =
  | "processing"
  | "completed"
  | "delivery_uncertain"
  | "delivery_failed"
  | "failed_retryable";

export type LineEventDeliveryStatus =
  | "not_attempted"
  | "reply_pending"
  | "reply_accepted"
  | "reply_rejected"
  | "reply_uncertain"
  | "push_pending"
  | "push_accepted"
  | "push_rejected"
  | "push_uncertain";

export type LineEventStateWriter = (
  eventIds: string[],
  status: LineEventStatus,
  deliveryStatus: LineEventDeliveryStatus,
  errorCode?: string,
) => Promise<void>;

export function classifyLineSendResult(result: {
  success: boolean;
  statusCode?: number;
  error?: string;
}): LineSendResult {
  if (result.success) {
    return { outcome: "accepted", statusCode: result.statusCode };
  }

  // A timeout (408), server error, or transport failure can happen after LINE accepted a send.
  // Treat it as uncertain and never issue a second customer-visible message automatically.
  if (
    result.statusCode === undefined || result.statusCode === 408 ||
    result.statusCode >= 500
  ) {
    return {
      outcome: "uncertain",
      statusCode: result.statusCode,
      error: result.error,
    };
  }

  return {
    outcome: "rejected",
    statusCode: result.statusCode,
    error: result.error,
  };
}

export async function sendReplyOrPushFallback(input: {
  eventIds: string[];
  replyToken?: string;
  sendReply: (replyToken: string) => Promise<LineSendResult>;
  sendPush: () => Promise<LineSendResult>;
  writeState: LineEventStateWriter;
}): Promise<
  {
    replied: boolean;
    pushed: boolean;
    outcome: LineDeliveryOutcome | "not_attempted";
  }
> {
  if (input.replyToken) {
    try {
      await input.writeState(input.eventIds, "processing", "reply_pending");
    } catch {
      return { replied: false, pushed: false, outcome: "not_attempted" };
    }
    let reply: LineSendResult;
    try {
      reply = await input.sendReply(input.replyToken);
    } catch (error) {
      reply = {
        outcome: "uncertain",
        error: error instanceof Error ? error.name : "unknown_error",
      };
    }

    if (reply.outcome === "accepted") {
      try {
        await input.writeState(input.eventIds, "completed", "reply_accepted");
        return { replied: true, pushed: false, outcome: "accepted" };
      } catch {
        return { replied: true, pushed: false, outcome: "uncertain" };
      }
    }

    if (reply.outcome === "uncertain") {
      await input.writeState(
        input.eventIds,
        "delivery_uncertain",
        "reply_uncertain",
        reply.statusCode ? `http_${reply.statusCode}` : "transport_uncertain",
      ).catch(() => undefined);
      return { replied: false, pushed: false, outcome: "uncertain" };
    }

    try {
      await input.writeState(
        input.eventIds,
        "processing",
        "reply_rejected",
        reply.statusCode ? `http_${reply.statusCode}` : "reply_rejected",
      );
    } catch {
      return { replied: false, pushed: false, outcome: "uncertain" };
    }
  }

  try {
    await input.writeState(input.eventIds, "processing", "push_pending");
  } catch {
    return { replied: false, pushed: false, outcome: "not_attempted" };
  }
  let push: LineSendResult;
  try {
    push = await input.sendPush();
  } catch (error) {
    push = {
      outcome: "uncertain",
      error: error instanceof Error ? error.name : "unknown_error",
    };
  }

  if (push.outcome === "accepted") {
    try {
      await input.writeState(input.eventIds, "completed", "push_accepted");
      return { replied: false, pushed: true, outcome: "accepted" };
    } catch {
      return { replied: false, pushed: true, outcome: "uncertain" };
    }
  }

  if (push.outcome === "uncertain") {
    await input.writeState(
      input.eventIds,
      "delivery_uncertain",
      "push_uncertain",
      push.statusCode ? `http_${push.statusCode}` : "transport_uncertain",
    ).catch(() => undefined);
    return { replied: false, pushed: false, outcome: "uncertain" };
  }

  await input.writeState(
    input.eventIds,
    "delivery_failed",
    "push_rejected",
    push.statusCode ? `http_${push.statusCode}` : "push_rejected",
  ).catch(() => undefined);
  return { replied: false, pushed: false, outcome: "rejected" };
}
