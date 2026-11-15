import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aiReplyAllowed,
  claimLineDelivery,
  mergeLegacySessionHistory,
  parseInboxListInput,
  recordCustomerInboxMessage,
  releaseLineDelivery,
  renewLineDelivery,
  startLineDeliveryHeartbeat,
} from "./line-inbox.ts";

Deno.test("legacy session history deduplicates safely, sorts, and rejects malformed entries", () => {
  const legacyTime = Date.now() - 30_000;
  const current = [{
    id: "7",
    role: "customer",
    messageType: "text",
    content: "current message",
    deliveryStatus: "received",
    timestamp: new Date(legacyTime + 3_000).toISOString(),
    eventId: "event-current",
  }, {
    id: "8",
    role: "ai",
    messageType: "text",
    content: "current AI reply",
    deliveryStatus: "accepted",
    timestamp: new Date(legacyTime + 4_000).toISOString(),
    eventId: "event-ai",
  }];
  const merged = mergeLegacySessionHistory(current, [
    {
      role: "user",
      content: "already stored",
      timestamp: legacyTime + 3_000,
      webhook_event_ids: ["event-current"],
    },
    {
      role: "assistant",
      content: "already stored AI reply",
      timestamp: legacyTime + 3_500,
      webhook_event_ids: ["event-ai"],
    },
    {
      role: "assistant",
      content: "legacy AI reply",
      timestamp: legacyTime + 1_000,
      webhook_event_ids: ["event-old-ai"],
    },
    {
      role: "assistant",
      content: "duplicate legacy AI reply",
      timestamp: legacyTime + 1_000,
      webhook_event_ids: ["event-old-ai"],
    },
    {
      role: "assistant",
      content: "legacy AI reply",
      timestamp: legacyTime + 1_000,
    },
    { role: "system", content: "hidden prompt", timestamp: legacyTime + 1_000 },
    { role: "user", content: "bad timestamp", timestamp: "bad" },
    { role: "user", content: "out of range", timestamp: 1e16 },
    { role: "user", content: "not numeric", timestamp: null },
    { role: "user", content: "seconds timestamp", timestamp: 1_700_000_000 },
  ]);
  assertEquals(
    merged.map(({ role, content }) => [role, content]),
    [
      ["ai", "legacy AI reply"],
      ["customer", "current message"],
      ["ai", "current AI reply"],
    ],
  );
  assertEquals(current.length, 2);
  assertEquals(
    mergeLegacySessionHistory([
      { ...current[1], timestamp: new Date(legacyTime + 2_000).toISOString() },
      { ...current[0], timestamp: new Date(legacyTime + 1_000).toISOString() },
    ], null).map((message) => message.id),
    [current[0].id, current[1].id],
  );
  assertEquals(mergeLegacySessionHistory(current, { invalid: true }), current);

  const stable = {
    role: "assistant",
    content: "stable legacy reply",
    timestamp: Date.now() - 10_000,
  };
  const firstId = mergeLegacySessionHistory([], [stable])[0].id;
  const afterTrim = mergeLegacySessionHistory([], [
    { role: "user", content: "older", timestamp: stable.timestamp - 1 },
    stable,
  ])[1].id;
  assertEquals(firstId, afterTrim);
});

Deno.test("legacy history deduplicates near-timestamp rows without hiding ambiguous repeats", () => {
  const timestamp = Date.now() - 1_000;
  const persisted = {
    id: "51",
    role: "customer",
    messageType: "text",
    content: "same text",
    deliveryStatus: "received",
    timestamp: new Date(timestamp).toISOString(),
    eventId: null,
  };
  const legacy = {
    role: "user",
    content: "same text",
    timestamp: timestamp + 500,
  };
  assertEquals(mergeLegacySessionHistory([persisted], [legacy]).length, 1);
  assertEquals(
    mergeLegacySessionHistory([
      persisted,
      {
        ...persisted,
        id: "52",
        timestamp: new Date(timestamp + 750).toISOString(),
      },
    ], [legacy]).length,
    3,
  );
});

Deno.test("legacy history caps input and rejects far-future timestamps", () => {
  const now = Date.now();
  const history = Array.from({ length: 101 }, (_, index) => ({
    role: "user",
    content: `message-${index}`,
    timestamp: now - 10_000 + index,
  }));
  const result = mergeLegacySessionHistory([], history);
  assertEquals(result.length, 100);
  assertEquals(
    mergeLegacySessionHistory([], [{
      role: "user",
      content: "far future",
      timestamp: now + 60 * 60 * 1000,
    }]).length,
    0,
  );
});

Deno.test("AI mode fails closed on missing or unreadable state", () => {
  assertEquals(aiReplyAllowed(null, null), false);
  assertEquals(
    aiReplyAllowed({ human_takeover: false }, new Error("read")),
    false,
  );
  assertEquals(aiReplyAllowed({ human_takeover: true }, null), false);
});

Deno.test("AI mode honors takeover and timed pause", () => {
  const now = Date.parse("2026-11-14T00:00:00Z");
  assertEquals(
    aiReplyAllowed({ human_takeover: false, paused_until: null }, null, now),
    true,
  );
  assertEquals(
    aiReplyAllowed(
      { human_takeover: false, paused_until: "2026-11-14T00:01:00Z" },
      null,
      now,
    ),
    false,
  );
  assertEquals(
    aiReplyAllowed(
      { human_takeover: false, paused_until: "2026-11-13T23:59:00Z" },
      null,
      now,
    ),
    true,
  );
  assertEquals(
    aiReplyAllowed(
      { human_takeover: false, paused_until: "invalid" },
      null,
      now,
    ),
    false,
  );
});

Deno.test("inbox list input rejects invalid filters and bounds search", () => {
  assertEquals(parseInboxListInput({ status: "root" }), null);
  assertEquals(parseInboxListInput({ offset: -1 }), null);
  assertEquals(
    parseInboxListInput({ status: "human", offset: 50, search: "  ช่าง\n" }),
    {
      status: "human",
      offset: 50,
      search: "ช่าง",
    },
  );
  assertEquals(
    parseInboxListInput({ search: "x".repeat(101) })?.search.length,
    100,
  );
});

function fakeInboxClient(options: {
  existing?: { id: number } | null;
  lookupError?: unknown;
  insertError?: { code?: string } | null;
  rpcData?: unknown;
  rpcError?: unknown;
} = {}) {
  type Query = {
    select(columns: string): Query;
    eq(column: string, value: unknown): Query;
    maybeSingle(): Promise<{ data: { id: number } | null; error: unknown }>;
    insert(
      row: Record<string, unknown>,
    ): Promise<{ error: { code?: string } | null }>;
  };
  let inserted: Record<string, unknown> | null = null;
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const query: Query = {
    select: (_columns: string) => query,
    eq: (_column: string, _value: unknown) => query,
    maybeSingle: () =>
      Promise.resolve({
        data: options.existing ?? null,
        error: options.lookupError ?? null,
      }),
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      return Promise.resolve({ error: options.insertError ?? null });
    },
  };
  const client = {
    from: (table: string) => {
      assertEquals(table, "line_inbox_messages");
      return query;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: options.rpcData ?? null,
        error: options.rpcError ?? null,
      });
    },
  } as unknown as Parameters<typeof recordCustomerInboxMessage>[0];
  return { client, rpcCalls, getInserted: () => inserted };
}

Deno.test("inbox records text and image messages and deduplicates retries", async () => {
  const input = {
    customerId: "customer-a",
    eventId: "event-a",
    lineMessageId: "line-message-a",
    messageType: "text" as const,
    content: "สวัสดี",
    createdAt: "2026-11-14T00:00:00Z",
  };
  const text = fakeInboxClient();
  assertEquals(
    await recordCustomerInboxMessage(text.client, input),
    "inserted",
  );
  assertEquals(text.getInserted(), {
    customer_id: input.customerId,
    event_id: input.eventId,
    line_message_id: input.lineMessageId,
    role: "customer",
    message_type: "text",
    content: input.content,
    delivery_status: "received",
    created_at: input.createdAt,
  });

  const image = fakeInboxClient();
  assertEquals(
    await recordCustomerInboxMessage(image.client, {
      ...input,
      messageType: "image",
      content: undefined,
    }),
    "inserted",
  );
  assertEquals(image.getInserted()?.content, null);

  const retry = fakeInboxClient({ existing: { id: 1 } });
  assertEquals(
    await recordCustomerInboxMessage(retry.client, input),
    "already-recorded",
  );
  assertEquals(retry.getInserted(), null);

  const duplicate = fakeInboxClient({ insertError: { code: "23505" } });
  assertEquals(
    await recordCustomerInboxMessage(duplicate.client, input),
    "duplicate-message",
  );
});

Deno.test("inbox message recording rejects blank provider identifiers", async () => {
  const input = {
    customerId: "customer-a",
    eventId: "",
    lineMessageId: "line-message-a",
    messageType: "text" as const,
    content: "synthetic text",
    createdAt: "2026-11-14T00:00:00Z",
  };
  const client = fakeInboxClient();
  await assertRejects(
    () => recordCustomerInboxMessage(client.client, input),
    Error,
    "inbox_invalid_message_id",
  );
  await assertRejects(
    () =>
      recordCustomerInboxMessage(client.client, {
        ...input,
        eventId: "event-a",
        lineMessageId: " ",
      }),
    Error,
    "inbox_invalid_message_id",
  );
  const invalidTimestamp = fakeInboxClient();
  await assertRejects(
    () =>
      recordCustomerInboxMessage(invalidTimestamp.client, {
        ...input,
        eventId: "event-a",
        createdAt: "invalid",
      }),
    Error,
    "inbox_invalid_timestamp",
  );
  const normalized = fakeInboxClient();
  await recordCustomerInboxMessage(normalized.client, {
    ...input,
    eventId: " event-a ",
    lineMessageId: " line-message-a ",
  });
  assertEquals(normalized.getInserted()?.event_id, "event-a");
  assertEquals(normalized.getInserted()?.line_message_id, "line-message-a");
  assertEquals(client.getInserted(), null);
});

Deno.test("inbox writes and delivery RPCs fail closed", async () => {
  const input = {
    customerId: "customer-a",
    eventId: "event-a",
    lineMessageId: "line-message-a",
    messageType: "text" as const,
    content: "สวัสดี",
    createdAt: "2026-11-14T00:00:00Z",
  };
  const lookupFailure = fakeInboxClient({ lookupError: new Error("db") });
  await assertRejects(
    () => recordCustomerInboxMessage(lookupFailure.client, input),
    Error,
    "inbox_lookup_failed",
  );
  const insertFailure = fakeInboxClient({ insertError: { code: "XX000" } });
  await assertRejects(
    () => recordCustomerInboxMessage(insertFailure.client, input),
    Error,
    "inbox_insert_failed",
  );

  const claimToken = "11111111-1111-4111-8111-111111111111";
  const claimed = fakeInboxClient({ rpcData: `claimed:${claimToken}` });
  assertEquals(
    await claimLineDelivery(claimed.client, "customer-a", "event-a", "ai"),
    { status: "claimed", claimToken },
  );
  assertEquals(claimed.rpcCalls[0], {
    name: "line_delivery_claim",
    args: { p_customer_id: "customer-a", p_event_id: "event-a", p_mode: "ai" },
  });
  const released = fakeInboxClient({ rpcData: false });
  assertEquals(
    await releaseLineDelivery(released.client, "customer-a", claimToken),
    false,
  );
  assertEquals(released.rpcCalls[0].name, "line_delivery_release");
  assertEquals(released.rpcCalls[0].args.p_event_id, claimToken);

  const renewed = fakeInboxClient({ rpcData: true });
  assertEquals(
    await renewLineDelivery(renewed.client, "customer-a", claimToken),
    true,
  );
  assertEquals(renewed.rpcCalls[0], {
    name: "line_delivery_renew",
    args: { p_customer_id: "customer-a", p_claim_token: claimToken },
  });
  const lostLease = fakeInboxClient({ rpcData: false });
  assertEquals(
    await renewLineDelivery(lostLease.client, "customer-a", claimToken),
    false,
  );
  const renewFailure = fakeInboxClient({ rpcError: new Error("db") });
  await assertRejects(
    () => renewLineDelivery(renewFailure.client, "customer-a", claimToken),
    Error,
    "line_delivery_renew_failed",
  );

  const releaseFailure = fakeInboxClient({ rpcError: new Error("db") });
  await assertRejects(
    () => releaseLineDelivery(releaseFailure.client, "customer-a", "event-a"),
    Error,
    "line_delivery_release_failed",
  );

  const blocked = fakeInboxClient({ rpcData: "human_takeover" });
  assertEquals(
    await claimLineDelivery(blocked.client, "customer-a", "event-a", "ai"),
    { status: "human_takeover", claimToken: null },
  );
  const legacyClaim = fakeInboxClient({ rpcData: "claimed" });
  await assertRejects(
    () => claimLineDelivery(legacyClaim.client, "customer-a", "event-a", "ai"),
    Error,
    "line_delivery_claim_failed",
  );
  const rpcFailure = fakeInboxClient({ rpcError: new Error("db") });
  await assertRejects(
    () => claimLineDelivery(rpcFailure.client, "customer-a", "event-a", "ai"),
    Error,
    "line_delivery_claim_failed",
  );
});

Deno.test({
  name: "delivery heartbeat aborts when its claim is lost",
  fn: async () => {
    const lostLease = fakeInboxClient({ rpcData: false });
    const heartbeat = startLineDeliveryHeartbeat(
      lostLease.client,
      "customer-a",
      "11111111-1111-4111-8111-111111111111",
    );
    await new Promise<void>((resolve) => {
      heartbeat.signal.addEventListener("abort", () => resolve(), {
        once: true,
      });
    });
    heartbeat.stop();
    assertEquals(heartbeat.signal.aborted, true);
    assertEquals(lostLease.rpcCalls[0].name, "line_delivery_renew");
  },
  timeout: 20_000,
});
