import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimLineWebhookEvent,
  lineEventKey,
  writeLineWebhookEventState,
} from "./line-webhook-event-store.ts";

Deno.test("LINE event key uses webhookEventId and prefixes the namespace", () => {
  assertEquals(
    lineEventKey({ webhookEventId: "01ABC", message: { id: "M1" } }),
    "event:01ABC",
  );
});

Deno.test("LINE event key falls back to message ID for older payloads", () => {
  assertEquals(lineEventKey({ message: { id: "M1" } }), "message:M1");
  assertEquals(lineEventKey({}), null);
});

Deno.test("claimLineWebhookEvent calls the atomic RPC and returns duplicate state", async () => {
  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      rpcArgs = args;
      return Promise.resolve({
        data: {
          claimed: false,
          status: "delivery_uncertain",
          delivery_status: "reply_uncertain",
        },
        error: null,
      });
    },
  } as unknown as Parameters<typeof claimLineWebhookEvent>[0];
  const result = await claimLineWebhookEvent(
    supabase,
    "event:01ABC",
    "message:text",
  );
  assertEquals(rpcName, "line_webhook_event_claim");
  assertEquals(rpcArgs, {
    p_event_id: "event:01ABC",
    p_event_type: "message:text",
    p_reclaim_after_seconds: 600,
  });
  assertEquals(result, {
    claimed: false,
    status: "delivery_uncertain",
    deliveryStatus: "reply_uncertain",
  });
});

Deno.test("writeLineWebhookEventState updates only claimed processing rows", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const supabase = {
    from: (table: string) => {
      assertEquals(table, "line_webhook_events");
      return {
        update: (values: Record<string, unknown>) => {
          calls.push({ method: "update", args: [values] });
          return {
            in: (column: string, ids: string[]) => {
              calls.push({ method: "in", args: [column, ids] });
              return {
                eq: (statusColumn: string, status: string) => {
                  calls.push({ method: "eq", args: [statusColumn, status] });
                  return {
                    select: (columns: string) => {
                      calls.push({ method: "select", args: [columns] });
                      return Promise.resolve({
                        data: [{ event_id: "event:01ABC" }],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof writeLineWebhookEventState>[0];
  await writeLineWebhookEventState(
    supabase,
    ["event:01ABC"],
    "delivery_uncertain",
    "reply_uncertain",
    "http_504",
  );
  assertEquals(calls.map((call) => call.method), [
    "update",
    "in",
    "eq",
    "select",
  ]);
  assertEquals(calls[1].args, ["event_id", ["event:01ABC"]]);
  assertEquals(calls[2].args, ["status", "processing"]);
});
