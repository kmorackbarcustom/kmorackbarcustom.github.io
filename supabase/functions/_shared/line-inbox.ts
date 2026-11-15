import type { createServiceClient } from "./database.ts";

type Supabase = ReturnType<typeof createServiceClient>;

export type InboxStatus = "all" | "ai" | "human";
export type InboxListInput = {
  search: string;
  status: InboxStatus;
  offset: number;
};

export type InboxHistoryMessage = {
  id: string;
  role: string;
  messageType: string;
  content: string | null;
  deliveryStatus: string;
  timestamp: string;
  eventId: string | null;
  eventIds?: string[];
};

export type DeliveryClaim =
  | { status: "claimed"; claimToken: string }
  | {
    status:
      | "busy"
      | "not_found"
      | "human_takeover"
      | "timed_pause"
      | "ai_mode"
      | "invalid_event"
      | "invalid_mode"
      | "error";
    claimToken: null;
  };

const MIN_LEGACY_TIMESTAMP = Date.UTC(2000, 0, 1);
const DELIVERY_RENEW_INTERVAL_MS = 10_000;
const DELIVERY_RENEW_TIMEOUT_MS = 5_000;

function legacyMessageId(role: string, timestamp: number, content: string) {
  const input = JSON.stringify([role, timestamp, content]);
  let hash = 14695981039346656037n;
  for (let index = 0; index < input.length; index++) {
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(input.charCodeAt(index))) * 1099511628211n,
    );
  }
  return `legacy-${timestamp}-${role}-${hash.toString(36)}`;
}

export function mergeLegacySessionHistory(
  messages: InboxHistoryMessage[],
  history: unknown,
): InboxHistoryMessage[] {
  const result = [...messages];
  const known = new Set(
    messages.flatMap((message) =>
      message.eventId ? [`${message.role}:${message.eventId}`] : []
    ),
  );
  const knownText = new Set(
    messages.flatMap((message) =>
      message.content === null ? [] : [JSON.stringify([
        message.role,
        Date.parse(message.timestamp),
        message.content,
      ])]
    ),
  );
  const matchedPersistedText = new Set<string>();
  if (Array.isArray(history)) {
    for (const value of history.slice(-100)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (item.role !== "user" && item.role !== "assistant") continue;
      const role = item.role === "assistant" ? "ai" : "customer";
      const eventIds = Array.isArray(item.webhook_event_ids)
        ? item.webhook_event_ids.filter((id): id is string =>
          typeof id === "string" && id.length > 0
        )
        : [];
      const timestamp = item.timestamp;
      if (
        typeof item.content !== "string" || typeof timestamp !== "number" ||
        !Number.isFinite(timestamp) || timestamp < MIN_LEGACY_TIMESTAMP
      ) {
        continue;
      }
      const date = new Date(timestamp);
      if (
        !Number.isFinite(date.getTime()) ||
        timestamp > Date.now() + 5 * 60 * 1000
      ) continue;
      const textKey = JSON.stringify([role, date.getTime(), item.content]);
      if (eventIds.some((id) => known.has(`${role}:${id}`))) continue;
      if (!eventIds.length) {
        if (knownText.has(textKey)) continue;
        const matches = messages.filter((message) =>
          !matchedPersistedText.has(message.id) && message.role === role &&
          message.content === item.content &&
          Math.abs(Date.parse(message.timestamp) - date.getTime()) <= 2000
        );
        if (matches.length === 1) {
          matchedPersistedText.add(matches[0].id);
          continue;
        }
      }
      result.push({
        id: legacyMessageId(role, timestamp, item.content),
        role,
        messageType: "text",
        content: item.content,
        deliveryStatus: "legacy",
        timestamp: date.toISOString(),
        eventId: null,
        eventIds,
      });
      for (const id of eventIds) known.add(`${role}:${id}`);
      knownText.add(textKey);
    }
  }
  return result.sort((a, b) => {
    const timeDifference = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (Number.isFinite(timeDifference) && timeDifference !== 0) {
      return timeDifference;
    }
    const aNumber = Number(a.id);
    const bNumber = Number(b.id);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }
    return a.id.localeCompare(b.id);
  });
}

export function parseInboxListInput(input: unknown): InboxListInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const status = value.status ?? "all";
  const offset = value.offset ?? 0;
  const search = value.search ?? "";
  if (
    typeof status !== "string" || !["all", "ai", "human"].includes(status) ||
    typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 ||
    offset > 100000 || typeof search !== "string"
  ) return null;
  return {
    search: search.trim().slice(0, 100),
    status: status as InboxStatus,
    offset,
  };
}

export function aiReplyAllowed(
  customer: { human_takeover?: boolean; paused_until?: string | null } | null,
  readError: unknown,
  now = Date.now(),
): boolean {
  if (readError || !customer || customer.human_takeover) return false;
  if (!customer.paused_until) return true;
  const until = Date.parse(customer.paused_until);
  return Number.isFinite(until) && until <= now;
}

export async function recordCustomerInboxMessage(
  supabase: Supabase,
  input: {
    customerId: string;
    eventId: string;
    lineMessageId: string;
    messageType: "text" | "image";
    content?: string;
    createdAt: string;
  },
): Promise<"inserted" | "already-recorded" | "duplicate-message"> {
  const eventId = input.eventId.trim();
  const lineMessageId = input.lineMessageId.trim();
  if (
    !eventId || eventId.length > 128 || !lineMessageId ||
    lineMessageId.length > 256
  ) throw new Error("inbox_invalid_message_id");
  if (!Number.isFinite(Date.parse(input.createdAt))) {
    throw new Error("inbox_invalid_timestamp");
  }
  const { data: existing, error: lookupError } = await supabase
    .from("line_inbox_messages")
    .select("id")
    .eq("event_id", eventId)
    .eq("role", "customer")
    .maybeSingle();
  if (lookupError) throw new Error("inbox_lookup_failed");
  if (existing) return "already-recorded";

  const { error } = await supabase.from("line_inbox_messages").insert({
    customer_id: input.customerId,
    event_id: eventId,
    line_message_id: lineMessageId,
    role: "customer",
    message_type: input.messageType,
    content: input.messageType === "text" ? input.content ?? "" : null,
    delivery_status: "received",
    created_at: input.createdAt,
  });
  if (error?.code === "23505") return "duplicate-message";
  if (error) throw new Error("inbox_insert_failed");
  return "inserted";
}

export async function claimLineDelivery(
  supabase: Supabase,
  customerId: string,
  eventId: string,
  mode: "ai" | "human",
): Promise<DeliveryClaim> {
  const { data, error } = await supabase.rpc("line_delivery_claim", {
    p_customer_id: customerId,
    p_event_id: eventId,
    p_mode: mode,
  });
  if (error || typeof data !== "string") {
    throw new Error("line_delivery_claim_failed");
  }
  if (data.startsWith("claimed:")) {
    const claimToken = data.slice("claimed:".length);
    if (!/^[0-9a-f-]{36}$/i.test(claimToken)) {
      throw new Error("line_delivery_claim_failed");
    }
    return { status: "claimed", claimToken };
  }
  if (
    data === "busy" || data === "not_found" || data === "human_takeover" ||
    data === "timed_pause" || data === "ai_mode" || data === "invalid_event" ||
    data === "invalid_mode"
  ) return { status: data, claimToken: null };
  throw new Error("line_delivery_claim_failed");
}

export async function renewLineDelivery(
  supabase: Supabase,
  customerId: string,
  claimToken: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("line_delivery_renew", {
    p_customer_id: customerId,
    p_claim_token: claimToken,
  });
  if (error || typeof data !== "boolean") {
    throw new Error("line_delivery_renew_failed");
  }
  return data;
}

export function startLineDeliveryHeartbeat(
  supabase: Supabase,
  customerId: string,
  claimToken: string,
): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  let stopped = false;
  let renewing = false;
  let timer: ReturnType<typeof setTimeout>;

  const renew = async () => {
    if (stopped || renewing) return;
    renewing = true;
    let timeout: ReturnType<typeof setTimeout>;
    try {
      const renewed = await Promise.race([
        renewLineDelivery(supabase, customerId, claimToken),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("line_delivery_renew_timeout")),
            DELIVERY_RENEW_TIMEOUT_MS,
          );
        }),
      ]);
      if (!renewed) throw new Error("line_delivery_renew_lost");
    } catch {
      controller.abort();
      console.error("[line-inbox] delivery lease renewal failed");
    } finally {
      clearTimeout(timeout!);
      renewing = false;
    }
    if (!stopped && !controller.signal.aborted) {
      timer = setTimeout(() => void renew(), DELIVERY_RENEW_INTERVAL_MS);
    }
  };

  timer = setTimeout(() => void renew(), DELIVERY_RENEW_INTERVAL_MS);
  return {
    signal: controller.signal,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export async function releaseLineDelivery(
  supabase: Supabase,
  customerId: string,
  claimToken: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("line_delivery_release", {
    p_customer_id: customerId,
    p_event_id: claimToken,
  });
  if (error || typeof data !== "boolean") {
    throw new Error("line_delivery_release_failed");
  }
  return data;
}
