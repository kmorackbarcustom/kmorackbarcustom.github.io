/**
 * Regression test for three LINE text-delivery defects (AGY findings, 2026-11-15):
 *
 *  1. the vendored text handler appended the assistant turn (and the state/context it produced)
 *     to the session *before* the handler claimed the delivery lease, so a suppressed or busy turn
 *     stayed in `line_chat_sessions.history` as if the customer had been answered;
 *  2. when the lease came back busy, the AI inbox row stayed `pending` - a state reconciliation
 *     reads as "send attempted, outcome unknown" instead of "never attempted";
 *  3. when the AI inbox row could not be written at all (OpenCode B1), the event stayed
 *     `processing` while the invocation threw, so redelivery could not claim it for the reclaim
 *     window (or at all) instead of retrying immediately.
 *
 * The shipped function is executed for real (`deno run supabase/functions/line-webhook/index.ts`)
 * against a PostgREST-shaped stub, so the assertions cover the deployed file rather than a
 * re-implementation of it. No LINE endpoint is reached: all three defects are decided before the
 * send, and the AI provider call fails closed on its missing key before any fetch.
 *
 * Run: deno test -A scripts/line-webhook-text-delivery.test.ts
 */

const CHANNEL_SECRET = "test-line-channel-secret";
const FUNCTION_PORT = 8000; // std@0.168 serve() has no configurable port and this file passes none.

type Row = Record<string, unknown>;

type RecordedRequest = {
  method: string;
  path: string;
  search: string;
  body: unknown;
};

const tables = new Map<string, Row[]>();
const requests: RecordedRequest[] = [];
// One-shot write failure for the AI inbox row, keyed by webhook event id: the way a restarting
// pooler answers (PostgREST-shaped 503) while the database is briefly unavailable.
const aiInboxWriteFailures = new Map<string, number>();

function table(name: string): Row[] {
  let rows = tables.get(name);
  if (!rows) {
    rows = [];
    tables.set(name, rows);
  }
  return rows;
}

function decodeInList(value: string): string[] {
  const inner = value.slice("in.(".length, value.lastIndexOf(")"));
  return inner.split(",").map((part) =>
    part.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"')
  );
}

function keyOf(row: Row, name: string): unknown {
  return row[name];
}

function applyFilters(rows: Row[], search: URLSearchParams): Row[] {
  let result = rows;
  for (const [column, value] of search.entries()) {
    if (
      column === "select" || column === "order" || column === "limit" ||
      column === "offset" || column.startsWith("order")
    ) {
      continue;
    }
    if (value.startsWith("eq.")) {
      const target = value.slice("eq.".length);
      result = result.filter((row) => String(keyOf(row, column)) === target);
      continue;
    }
    if (value.startsWith("in.(")) {
      const allowed = new Set(decodeInList(value));
      result = result.filter((row) => allowed.has(String(keyOf(row, column))));
    }
  }
  return result;
}

function upsertRows(name: string, incoming: Row[], onConflict: string | null) {
  const rows = table(name);
  const conflictColumns = (onConflict ?? "").split(",").filter(Boolean);
  for (const row of incoming) {
    const existing = conflictColumns.length
      ? rows.find((candidate) =>
        conflictColumns.every((column) =>
          JSON.stringify(candidate[column] ?? null) ===
            JSON.stringify(row[column] ?? null)
        )
      )
      : rows.find((candidate) =>
        candidate.id === row.id && row.id !== undefined
      );
    if (existing) Object.assign(existing, row);
    else rows.push({ ...row });
  }
}

/** Mirrors public.line_append_chat_history (20261021120000_line_webhook_idempotency.sql). */
function appendChatHistory(args: Row): Row {
  const userId = String(args.p_user_id);
  const message = { ...(args.p_message as Row) };
  const maxHistory = Number(args.p_max_history ?? 40);
  const eventIds = (args.p_event_ids as string[] | undefined) ?? [];
  if (eventIds.length > 0) message.webhook_event_ids = eventIds;
  const rows = table("line_chat_sessions");
  let session = rows.find((row) => row.user_id === userId);
  if (!session) {
    session = { user_id: userId, state: "IDLE", context_data: {}, history: [] };
    rows.push(session);
  }
  const history = (session.history as Row[]) ?? [];
  const duplicate = eventIds.length > 0 &&
    history.some((item) =>
      item.role === message.role &&
      (item.webhook_event_ids as string[] | undefined ?? []).some((id) =>
        eventIds.includes(id)
      )
    );
  if (!duplicate) {
    const next = [...history, message];
    session.history = next.slice(Math.max(0, next.length - maxHistory));
    session.last_interaction = new Date().toISOString();
  }
  return session;
}

function rpcResult(name: string, args: Row): unknown {
  if (name === "line_webhook_event_claim") {
    const eventId = String(args.p_event_id);
    const rows = table("line_webhook_events");
    let row = rows.find((candidate) => candidate.event_id === eventId);
    if (!row) {
      row = {
        event_id: eventId,
        event_type: String(args.p_event_type ?? ""),
        status: "processing",
        delivery_status: "not_attempted",
        last_error_code: null,
        attempt_count: 1,
      };
      rows.push(row);
    } else {
      // Mirrors line_webhook_event_claim's reclaim branch: one row per event_id, and a
      // `failed_retryable` event is claimed again with a bumped attempt_count.
      row.status = "processing";
      row.delivery_status = "not_attempted";
      row.last_error_code = null;
      row.attempt_count = Number(row.attempt_count ?? 0) + 1;
    }
    return {
      claimed: true,
      status: row.status,
      delivery_status: row.delivery_status,
    };
  }
  if (name === "line_append_chat_history") return appendChatHistory(args);
  if (name === "line_delivery_claim") {
    // Lease outcome is chosen by the event under test.
    const eventId = String(args.p_event_id);
    if (eventId.includes("busy")) return "busy";
    if (eventId.includes("pause")) return "timed_pause";
    return "busy";
  }
  if (name === "line_delivery_release") return true;
  if (name === "line_delivery_renew") return true;
  throw new Error(`unexpected rpc: ${name}`);
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = req.method === "GET" || req.method === "HEAD"
    ? null
    : await req.json().catch(() => null);
  requests.push({
    method: req.method,
    path: url.pathname,
    search: url.search,
    body,
  });

  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/);
  if (rpc) {
    try {
      return Response.json(rpcResult(rpc[1], (body ?? {}) as Row));
    } catch (error) {
      return Response.json({ message: String(error) }, { status: 400 });
    }
  }

  const match = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (!match) return new Response("not found", { status: 404 });
  const name = match[1];
  const search = url.searchParams;

  if (req.method === "GET") {
    // Return the array shape even for `Accept: application/vnd.pgrst.object+json`:
    // postgrest-js `maybeSingle()` collapses a 0/1-row array itself.
    return Response.json(applyFilters(table(name), search));
  }

  if (req.method === "POST") {
    const incoming = Array.isArray(body) ? body as Row[] : [body as Row];
    const failedEventId = name === "line_inbox_messages"
      ? incoming.find((row) => row.role === "ai")?.event_id
      : undefined;
    const queuedFailures = typeof failedEventId === "string"
      ? aiInboxWriteFailures.get(failedEventId) ?? 0
      : 0;
    if (queuedFailures > 0) {
      aiInboxWriteFailures.set(failedEventId as string, queuedFailures - 1);
      return Response.json({
        code: "503",
        message: "transient inbox write failure",
      }, { status: 503 });
    }
    upsertRows(name, incoming, search.get("on_conflict"));
    return new Response(null, { status: 201 });
  }

  if (req.method === "PATCH") {
    const rows = applyFilters(table(name), search);
    for (const row of rows) Object.assign(row, body as Row);
    if (req.headers.get("prefer")?.includes("return=representation")) {
      return Response.json(rows.map((row) => ({ ...row })));
    }
    return new Response(null, { status: 204 });
  }

  return new Response("unsupported", { status: 405 });
}

async function sign(rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function textEvent(input: {
  userId: string;
  messageId: string;
  text: string;
}): Row {
  return {
    type: "message",
    mode: "active",
    timestamp: Date.now(),
    replyToken: `reply-token-${input.messageId}`,
    source: { type: "user", userId: input.userId },
    message: { id: input.messageId, type: "text", text: input.text },
  };
}

async function postWebhook(events: Row[]): Promise<Response> {
  const rawBody = JSON.stringify({ destination: "U-destination", events });
  return await fetch(`http://127.0.0.1:${FUNCTION_PORT}/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": await sign(rawBody),
    },
    body: rawBody,
  });
}

function seed(): void {
  tables.clear();
  requests.length = 0;
  aiInboxWriteFailures.clear();
  table("system_settings").push(
    { key: "line_ai_rollout", value: "all" },
    { key: "line_ai_image_rollout", value: "off" },
    { key: "shop_name", value: "KMO" },
    { key: "session_ttl_hours", value: "6" },
  );
  table("customers").push({
    id: "11111111-1111-4111-8111-111111111111",
    line_uid: "U-busy",
    name: "ลูกค้าทดสอบ",
    line_display_name: "test",
    phone: null,
    paused_until: null,
    human_takeover: false,
  });
  table("customers").push({
    id: "22222222-2222-4222-8222-222222222222",
    line_uid: "U-pause",
    name: "ลูกค้าทดสอบ 2",
    line_display_name: "test2",
    phone: null,
    paused_until: null,
    human_takeover: false,
  });
  table("customers").push({
    id: "33333333-3333-4333-8333-333333333333",
    line_uid: "U-inbox",
    name: "ลูกค้าทดสอบ 3",
    line_display_name: "test3",
    phone: null,
    paused_until: null,
    human_takeover: false,
  });
  table("shop_faqs");
  table("line_chat_sessions");
  table("line_inbox_messages");
  table("line_webhook_events");
}

function assistantHistoryAppends(): RecordedRequest[] {
  return requests.filter((request) =>
    request.path === "/rest/v1/rpc/line_append_chat_history" &&
    (request.body as Row | null)?.p_message &&
    ((request.body as Row).p_message as Row).role === "assistant"
  );
}

function requestCount(path: string, eventId: string): number {
  return requests.filter((request) =>
    request.path === path &&
    JSON.stringify(request.body ?? null).includes(eventId)
  ).length;
}

function inboxRows(eventId: string, role: string): Row[] {
  return table("line_inbox_messages").filter((row) =>
    row.event_id === eventId && row.role === role
  );
}

function historyRoles(lineUid: string): unknown {
  const session = table("line_chat_sessions").find((row) =>
    row.user_id === lineUid
  );
  return ((session?.history as Row[]) ?? []).map((item) => item.role);
}

function eventRow(eventId: string): Row | undefined {
  return table("line_webhook_events").find((row) => row.event_id === eventId);
}

async function waitForListen(
  child: Deno.ChildProcess,
): Promise<{ stopReading: () => void; logs: () => string }> {
  const decoder = new TextDecoder();
  let stdoutText = "";
  let stderrText = "";
  const stdoutReader = child.stdout.getReader();
  const stderrReader = child.stderr.getReader();
  void (async () => {
    while (true) {
      const chunk = await stderrReader.read();
      if (chunk.done) break;
      stderrText += decoder.decode(chunk.value);
    }
  })();
  const deadline = Date.now() + 60_000;
  while (!stdoutText.includes("Listening on")) {
    if (Date.now() > deadline) {
      throw new Error(
        `line-webhook function never started listening (port ${FUNCTION_PORT}); ` +
          `is that port taken? stdout:\n${stdoutText}\nstderr:\n${stderrText}`,
      );
    }
    const chunk = await Promise.race([
      stdoutReader.read(),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 200)
      ),
    ]);
    if (!chunk) continue;
    if (chunk.done) {
      throw new Error(
        `line-webhook function exited before listening; stdout:\n${stdoutText}\nstderr:\n${stderrText}`,
      );
    }
    stdoutText += decoder.decode(chunk.value);
  }
  return {
    stopReading: () => {
      void stdoutReader.cancel().catch(() => undefined);
      void stderrReader.cancel().catch(() => undefined);
    },
    logs: () => `stdout:\n${stdoutText}\nstderr:\n${stderrText}`,
  };
}

Deno.test(
  "text turn: suppressed/busy delivery does not commit the assistant turn and suppresses its inbox row",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    seed();
    const repoRoot = new URL("../", import.meta.url);
    const server = Deno.serve(
      { port: 0, hostname: "127.0.0.1", onListen: () => {} },
      handle,
    );
    const stubPort = (server.addr as Deno.NetAddr).port;
    const child = new Deno.Command(Deno.execPath(), {
      cwd: repoRoot,
      args: [
        "run",
        "--allow-env",
        "--allow-net",
        "supabase/functions/line-webhook/index.ts",
      ],
      env: {
        SUPABASE_URL: `http://127.0.0.1:${stubPort}`,
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        LINE_CHANNEL_SECRET: CHANNEL_SECRET,
        LINE_CHANNEL_ACCESS_TOKEN: "test-channel-access-token",
        NO_COLOR: "1",
      },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const listening = await waitForListen(child);
    try {
      // (a) lease busy -> retryable failure. Before the fix the assistant turn was already in
      // history and the AI inbox row stayed `pending`.
      const busy = await postWebhook([
        textEvent({
          userId: "U-busy",
          messageId: "busy-1",
          text: "สวัสดีครับ อยากสอบถามเรื่องยาง",
        }),
      ]);
      const busyBody = await busy.text();
      assertEquals(busy.status, 500, `unexpected status: ${busyBody}`);
      assertEquals(JSON.parse(busyBody).error, "webhook_failed");

      const busySession = table("line_chat_sessions").find((row) =>
        row.user_id === "U-busy"
      );
      assertExists(busySession, `no session row. logs:\n${listening.logs()}`);
      assertEquals(
        ((busySession.history as Row[]) ?? []).map((item) => item.role),
        ["user"],
        "an unsent assistant turn must not be committed to session history",
      );
      assertEquals(assistantHistoryAppends().length, 0);

      const busyInbox = table("line_inbox_messages").filter((row) =>
        row.event_id === "message:busy-1" && row.role === "ai"
      );
      assertEquals(busyInbox.length, 1);
      assertEquals(
        busyInbox[0].delivery_status,
        "suppressed",
        "a never-attempted AI row must not stay pending",
      );
      const busyEvent = table("line_webhook_events").find((row) =>
        row.event_id === "message:busy-1"
      );
      assertEquals(busyEvent?.status, "failed_retryable");
      assertEquals(busyEvent?.last_error_code, "delivery_busy");

      // (b) lease refused for another reason (timed pause) -> completed, not attempted; the row
      // must also be suppressed and no turn may be recorded.
      const paused = await postWebhook([
        textEvent({
          userId: "U-pause",
          messageId: "pause-1",
          text: "สอบถามราคาโช้คอัพครับ",
        }),
      ]);
      const pausedBody = await paused.text();
      assertEquals(paused.status, 200, `unexpected status: ${pausedBody}`);
      const pauseSession = table("line_chat_sessions").find((row) =>
        row.user_id === "U-pause"
      );
      assertEquals(
        ((pauseSession?.history as Row[]) ?? []).map((item) => item.role),
        ["user"],
      );
      assertEquals(assistantHistoryAppends().length, 0);
      const pauseInbox = table("line_inbox_messages").filter((row) =>
        row.event_id === "message:pause-1" && row.role === "ai"
      );
      assertEquals(pauseInbox[0]?.delivery_status, "suppressed");
      const pauseEvent = table("line_webhook_events").find((row) =>
        row.event_id === "message:pause-1"
      );
      assertEquals(pauseEvent?.status, "completed");
      assertEquals(pauseEvent?.delivery_status, "not_attempted");
    } finally {
      listening.stopReading();
      try {
        child.kill();
      } catch {
        // already exited
      }
      await child.status.catch(() => undefined);
      await server.shutdown();
    }
  },
);

/**
 * OpenCode B1: when writing the generated reply into `line_inbox_messages` fails, the invocation
 * threw with the event row left `processing` - not `failed_retryable` - so LINE's redelivery was
 * refused for the reclaim window instead of retrying immediately. The failed write must also keep
 * the pipeline away from the send: the delivery lease (and thus any LINE call) comes after it.
 */
Deno.test(
  "text turn: a transient AI inbox write failure is retryable and reaches no LINE send",
  { sanitizeOps: false, sanitizeResources: false },
  async () => {
    seed();
    const eventId = "message:inbox-busy-1";
    const repoRoot = new URL("../", import.meta.url);
    const server = Deno.serve(
      { port: 0, hostname: "127.0.0.1", onListen: () => {} },
      handle,
    );
    const stubPort = (server.addr as Deno.NetAddr).port;
    const child = new Deno.Command(Deno.execPath(), {
      cwd: repoRoot,
      args: [
        "run",
        "--allow-env",
        "--allow-net",
        "supabase/functions/line-webhook/index.ts",
      ],
      env: {
        SUPABASE_URL: `http://127.0.0.1:${stubPort}`,
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        LINE_CHANNEL_SECRET: CHANNEL_SECRET,
        LINE_CHANNEL_ACCESS_TOKEN: "test-channel-access-token",
        NO_COLOR: "1",
      },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const listening = await waitForListen(child);
    try {
      // (a) first delivery: the reply is generated, its inbox row cannot be written.
      aiInboxWriteFailures.set(eventId, 1);
      const first = await postWebhook([
        textEvent({
          userId: "U-inbox",
          messageId: "inbox-busy-1",
          text: "สวัสดีครับ อยากสอบถามเรื่องล้อแม็ก",
        }),
      ]);
      const firstBody = await first.text();
      assertEquals(first.status, 500, `unexpected status: ${firstBody}`);
      assertEquals(JSON.parse(firstBody).error, "webhook_failed");

      const firstEvent = eventRow(eventId);
      assertExists(firstEvent, `no event row. logs:\n${listening.logs()}`);
      assertEquals(firstEvent.status, "failed_retryable");
      assertEquals(firstEvent.delivery_status, "not_attempted");
      assertEquals(firstEvent.last_error_code, "inbox_record_failed");

      // Nothing was sent, and nothing was recorded as "generated, not sent" either.
      assertEquals(inboxRows(eventId, "ai"), []);
      assertEquals(
        requestCount("/rest/v1/rpc/line_delivery_claim", eventId),
        0,
        "the delivery lease (the step before any LINE send) must not be reached",
      );
      assertEquals(historyRoles("U-inbox"), ["user"]);
      assertEquals(assistantHistoryAppends().length, 0);

      // (b) LINE redelivers the same event: `failed_retryable` is claimable, so the turn is
      // processed again and this time gets past the write that failed.
      const retry = await postWebhook([
        textEvent({
          userId: "U-inbox",
          messageId: "inbox-busy-1",
          text: "สวัสดีครับ อยากสอบถามเรื่องล้อแม็ก",
        }),
      ]);
      const retryBody = await retry.text();
      assertEquals(retry.status, 500, `unexpected status: ${retryBody}`);
      assertEquals(JSON.parse(retryBody).error, "webhook_failed");
      assertEquals(
        requestCount("/rest/v1/rpc/line_delivery_claim", eventId),
        1,
        "the retry must reach the delivery lease exactly once",
      );

      const retryEvent = eventRow(eventId);
      assertExists(
        retryEvent,
        `no event row after retry. logs:\n${listening.logs()}`,
      );
      assertEquals(
        retryEvent.attempt_count,
        2,
        "the retry re-claimed the event",
      );
      assertEquals(retryEvent.status, "failed_retryable");
      assertEquals(retryEvent.delivery_status, "not_attempted");
      assertEquals(retryEvent.last_error_code, "delivery_busy");

      const retryInbox = inboxRows(eventId, "ai");
      assertEquals(retryInbox.length, 1, "the retried write landed once");
      assertEquals(retryInbox[0].delivery_status, "suppressed");
      assertEquals(inboxRows(eventId, "customer").length, 1);
      assertEquals(historyRoles("U-inbox"), ["user"]);
      assertEquals(assistantHistoryAppends().length, 0);
    } finally {
      listening.stopReading();
      try {
        child.kill();
      } catch {
        // already exited
      }
      await child.status.catch(() => undefined);
      await server.shutdown();
    }
  },
);

// Minimal assertions so this file stays self-contained for `deno test`.
function assertExists(
  value: unknown,
  message: string,
): asserts value {
  if (value === undefined || value === null) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `${message ? `${message}: ` : ""}expected ${b}, received ${a}`,
    );
  }
}
