import type { createServiceClient } from "./database.ts";
import type {
  LineEventDeliveryStatus,
  LineEventStatus,
} from "./line-delivery.ts";

export function lineEventKey(event: {
  webhookEventId?: string;
  message?: { id?: string };
}): string | null {
  if (event.webhookEventId) return `event:${event.webhookEventId}`;
  if (event.message?.id) return `message:${event.message.id}`;
  return null;
}

export async function claimLineWebhookEvent(
  supabase: ReturnType<typeof createServiceClient>,
  eventId: string,
  eventType: string,
): Promise<{ claimed: boolean; status?: string; deliveryStatus?: string }> {
  const { data, error } = await supabase.rpc("line_webhook_event_claim", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_reclaim_after_seconds: 600,
  });
  if (error || !data || typeof data.claimed !== "boolean") {
    console.error("[line-webhook] event claim failed", {
      eventId,
      errorCode: error?.code ?? "invalid_claim_result",
    });
    throw error ??
      new Error("line_webhook_event_claim returned invalid result");
  }
  return {
    claimed: data.claimed,
    status: typeof data.status === "string" ? data.status : undefined,
    deliveryStatus: typeof data.delivery_status === "string"
      ? data.delivery_status
      : undefined,
  };
}

export async function writeLineWebhookEventState(
  supabase: ReturnType<typeof createServiceClient>,
  eventIds: string[],
  status: LineEventStatus,
  deliveryStatus: LineEventDeliveryStatus,
  errorCode?: string,
): Promise<void> {
  if (eventIds.length === 0) return;
  const { data, error } = await supabase
    .from("line_webhook_events")
    .update({
      status,
      delivery_status: deliveryStatus,
      last_error_code: errorCode ?? null,
      updated_at: new Date().toISOString(),
    })
    .in("event_id", eventIds)
    .eq("status", "processing")
    .select("event_id");

  if (error || !data || data.length !== eventIds.length) {
    console.error("[line-webhook] event state update failed", {
      eventCount: eventIds.length,
      status,
      deliveryStatus,
      errorCode: error?.code ?? "event_state_count_mismatch",
    });
    throw error ?? new Error("Not all LINE webhook event rows were updated");
  }
}
