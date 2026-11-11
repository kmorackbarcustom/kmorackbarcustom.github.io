import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyLineSendResult,
  type LineEventStateWriter,
  sendReplyOrPushFallback,
} from "./line-delivery.ts";
import { createHttpClient, HttpError } from "./vendor/http-client/index.ts";

Deno.test("LINE delivery classification treats timeout, transport errors and 5xx as uncertain", () => {
  assertEquals(
    classifyLineSendResult({ success: false, statusCode: 408 }).outcome,
    "uncertain",
  );
  assertEquals(
    classifyLineSendResult({ success: false, statusCode: 503 }).outcome,
    "uncertain",
  );
  assertEquals(
    classifyLineSendResult({ success: false, error: "network" }).outcome,
    "uncertain",
  );
});

Deno.test("LINE delivery classification treats explicit 4xx rejection as definite", () => {
  assertEquals(
    classifyLineSendResult({ success: false, statusCode: 400 }).outcome,
    "rejected",
  );
  assertEquals(
    classifyLineSendResult({ success: true, statusCode: 200 }).outcome,
    "accepted",
  );
});

Deno.test("HTTP client does not retry an unsafe send POST after 503", async () => {
  let attempts = 0;
  const client = createHttpClient({
    transport: {
      send: () => {
        attempts++;
        return Promise.resolve({
          status: 503,
          headers: { "content-type": "application/json" },
          body: '{"error":"temporary"}',
        });
      },
    },
  });

  let statusCode: number | undefined;
  try {
    await client.request({
      url: "https://api.line.me/v2/bot/message/reply",
      method: "POST",
      body: { replyToken: "synthetic", messages: [] },
    });
  } catch (error) {
    if (error instanceof HttpError) statusCode = error.status;
  }

  assertEquals(attempts, 1);
  assertEquals(statusCode, 503);
  assertEquals(
    classifyLineSendResult({ success: false, statusCode }).outcome,
    "uncertain",
  );
});

Deno.test("ambiguous reply result is recorded and never falls through to push", async () => {
  let pushes = 0;
  const states: string[] = [];
  const writeState: LineEventStateWriter = (
    _ids,
    status,
    deliveryStatus,
  ) => {
    states.push(`${status}:${deliveryStatus}`);
    return Promise.resolve();
  };
  const result = await sendReplyOrPushFallback({
    eventIds: ["event:E1"],
    replyToken: "reply-token",
    sendReply: () => Promise.resolve({ outcome: "uncertain", statusCode: 504 }),
    sendPush: () => {
      pushes++;
      return Promise.resolve({ outcome: "accepted" as const });
    },
    writeState,
  });
  assertEquals(result, { replied: false, pushed: false, outcome: "uncertain" });
  assertEquals(pushes, 0);
  assertEquals(states, [
    "processing:reply_pending",
    "delivery_uncertain:reply_uncertain",
  ]);
});

Deno.test("explicit reply rejection permits one push fallback", async () => {
  let pushes = 0;
  const states: string[] = [];
  const result = await sendReplyOrPushFallback({
    eventIds: ["event:E1"],
    replyToken: "reply-token",
    sendReply: () => Promise.resolve({ outcome: "rejected", statusCode: 400 }),
    sendPush: () => {
      pushes++;
      return Promise.resolve({ outcome: "accepted" as const, statusCode: 200 });
    },
    writeState: (_ids, status, deliveryStatus) => {
      states.push(`${status}:${deliveryStatus}`);
      return Promise.resolve();
    },
  });
  assertEquals(result, { replied: false, pushed: true, outcome: "accepted" });
  assertEquals(pushes, 1);
  assertEquals(states, [
    "processing:reply_pending",
    "processing:reply_rejected",
    "processing:push_pending",
    "completed:push_accepted",
  ]);
});

Deno.test("ambiguous push result stays uncertain and is not repeated", async () => {
  let pushes = 0;
  const states: string[] = [];
  const result = await sendReplyOrPushFallback({
    eventIds: ["event:E1"],
    sendReply: () => Promise.resolve({ outcome: "accepted" }),
    sendPush: () => {
      pushes++;
      return Promise.resolve({
        outcome: "uncertain" as const,
        error: "timeout",
      });
    },
    writeState: (_ids, status, deliveryStatus) => {
      states.push(`${status}:${deliveryStatus}`);
      return Promise.resolve();
    },
  });
  assertEquals(result, { replied: false, pushed: false, outcome: "uncertain" });
  assertEquals(pushes, 1);
  assertEquals(states, [
    "processing:push_pending",
    "delivery_uncertain:push_uncertain",
  ]);
});
