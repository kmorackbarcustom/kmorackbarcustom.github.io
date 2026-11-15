import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient } from "../_shared/database.ts";
import { SupabaseAuditStore } from "../_shared/audit-log-store.ts";
import {
  downloadLineImageContent,
  pushMessageWithOutcome,
} from "../_shared/line.ts";
import {
  claimLineDelivery,
  mergeLegacySessionHistory,
  parseInboxListInput,
  releaseLineDelivery,
  startLineDeliveryHeartbeat,
} from "../_shared/line-inbox.ts";
import {
  decodeStaffPasscodeHeader,
  forwardedClientIp,
  issueStaffSessionToken,
  staffIpFingerprint,
  staffPasscodeMatches,
  staffSessionTokenMatches,
} from "../_shared/staff-auth.ts";
import { createAuditLog } from "../_shared/vendor/audit-log/core/index.ts";

const ALLOWED_ORIGIN = "https://kmorackbarcustom.github.io";
const MAX_MESSAGE_LENGTH = 1000;
const PAGE_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-staff-key, x-staff-key-b64, x-staff-session",
  "Access-Control-Expose-Headers": "x-staff-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function attachStaffSession(
  response: Response,
  token: string | null,
): Response {
  if (!token) return response;
  const headers = new Headers(response.headers);
  headers.set("x-staff-session", token);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; name?: unknown };
    if (typeof value.code === "string") return value.code;
    if (typeof value.name === "string") return value.name;
  }
  return "unknown";
}

function fail(action: string, error: unknown): Response {
  console.error(`[staff-reply] ${action} failed`, {
    errorCode: errorCode(error),
  });
  return jsonResponse({ ok: false, error: "request_failed" }, 500);
}

async function recordAudit(
  audit: ReturnType<typeof createAuditLog>,
  input: Parameters<ReturnType<typeof createAuditLog>["record"]>[0],
): Promise<boolean> {
  const result = await audit.record(input);
  if (!result.success) {
    console.error("[staff-reply] audit record failed", {
      errorCode: errorCode(result.error),
    });
  }
  return result.success;
}

async function handleList(
  supabase: ReturnType<typeof createServiceClient>,
  body: unknown,
) {
  const input = parseInboxListInput(body);
  if (!input) {
    return jsonResponse({ ok: false, error: "invalid_list_filter" }, 400);
  }
  const { data, error } = await supabase.rpc("line_inbox_list", {
    p_search: input.search || null,
    p_status: input.status,
    p_offset: input.offset,
    p_limit: PAGE_SIZE + 1,
  });
  if (error) return fail("list", error);
  const rows = data ?? [];
  return jsonResponse({
    ok: true,
    matches: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    nextOffset: input.offset + PAGE_SIZE,
  });
}

async function setHumanMode(
  supabase: ReturnType<typeof createServiceClient>,
  body: { customerId?: string },
  humanTakeover: boolean,
) {
  const customerId = body.customerId ?? "";
  if (!customerId) {
    return jsonResponse({ ok: false, error: "customer_id_required" }, 400);
  }
  const { data: customer, error: lookupError } = await supabase
    .from("customers")
    .select("id, paused_until")
    .eq("id", customerId)
    .maybeSingle();
  if (lookupError) return fail("mode_lookup", lookupError);
  if (!customer) {
    return jsonResponse({ ok: false, error: "customer_not_found" }, 404);
  }

  const { data: result, error } = await supabase.rpc(
    "line_customer_set_human_mode",
    {
      p_customer_id: customerId,
      p_human_takeover: humanTakeover,
    },
  );
  if (error) return fail("mode_update", error);
  if (result === "not_found") {
    return jsonResponse({ ok: false, error: "customer_not_found" }, 404);
  }
  if (result === "active_delivery") {
    return jsonResponse({ ok: false, error: "delivery_in_progress" }, 409);
  }
  if (result !== "updated" && result !== "unchanged") {
    return fail("mode_update", result);
  }

  return jsonResponse({
    ok: true,
    humanTakeover,
    pausedUntil: customer.paused_until,
  });
}

function messageResult(
  record: {
    customer_id: string;
    content: string | null;
    delivery_status: string;
    id: number | string;
  },
  customerId: string,
  message: string,
) {
  if (record.customer_id !== customerId || record.content !== message) {
    return jsonResponse({ ok: false, error: "request_id_conflict" }, 409);
  }
  if (record.delivery_status === "accepted") {
    return jsonResponse({
      ok: true,
      delivery: "accepted",
      messageId: String(record.id),
      duplicate: true,
    });
  }
  if (
    record.delivery_status === "uncertain" ||
    record.delivery_status === "pending"
  ) {
    return jsonResponse({
      ok: false,
      error: "line_push_uncertain",
      delivery: "uncertain",
    }, 502);
  }
  return jsonResponse({
    ok: false,
    error: "line_push_rejected",
    delivery: "rejected",
  }, 502);
}

async function findRequest(
  supabase: ReturnType<typeof createServiceClient>,
  requestId: string,
) {
  return await supabase.from("line_inbox_messages")
    .select("id, customer_id, content, delivery_status")
    .eq("request_id", requestId)
    .maybeSingle();
}

async function handleSend(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string; message?: string; requestId?: string },
) {
  const customerId = body.customerId ?? "";
  const message = (body.message ?? "").trim();
  const requestId = body.requestId ?? "";
  if (
    !customerId || !message ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(requestId)
  ) {
    return jsonResponse({
      ok: false,
      error: "customer_message_and_request_id_required",
    }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ ok: false, error: "message_too_long" }, 400);
  }

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, line_uid, human_takeover")
    .eq("id", customerId)
    .maybeSingle();
  if (fetchError) return fail("send_lookup", fetchError);
  if (!customer?.line_uid) {
    return jsonResponse({ ok: false, error: "customer_not_found" }, 404);
  }
  const prior = await findRequest(supabase, requestId);
  if (prior.error) return fail("send_request_lookup", prior.error);
  if (prior.data) return messageResult(prior.data, customerId, message);
  if (!customer.human_takeover) {
    return jsonResponse({ ok: false, error: "takeover_required" }, 409);
  }

  let locked = false;
  let claimToken: string | null = null;
  let heartbeat: ReturnType<typeof startLineDeliveryHeartbeat> | null = null;
  try {
    const claim = await claimLineDelivery(
      supabase,
      customerId,
      requestId,
      "human",
    );
    if (claim.status !== "claimed") {
      if (claim.status === "busy") {
        return jsonResponse({ ok: false, error: "delivery_in_progress" }, 409);
      }
      if (claim.status === "ai_mode") {
        return jsonResponse({ ok: false, error: "takeover_required" }, 409);
      }
      if (claim.status === "not_found") {
        return jsonResponse({ ok: false, error: "customer_not_found" }, 404);
      }
      return jsonResponse({ ok: false, error: "delivery_not_allowed" }, 409);
    }
    claimToken = claim.claimToken;
    heartbeat = startLineDeliveryHeartbeat(
      supabase,
      customerId,
      claimToken,
    );
    locked = true;

    const { data: inserted, error: insertError } = await supabase
      .from("line_inbox_messages")
      .insert({
        customer_id: customerId,
        role: "staff",
        message_type: "text",
        content: message,
        request_id: requestId,
        delivery_status: "pending",
      })
      .select("id")
      .single();
    if (insertError?.code === "23505") {
      const duplicate = await findRequest(supabase, requestId);
      if (duplicate.error) {
        return fail("send_duplicate_lookup", duplicate.error);
      }
      if (duplicate.data) {
        return messageResult(duplicate.data, customerId, message);
      }
      return jsonResponse({ ok: false, error: "request_id_conflict" }, 409);
    }
    if (insertError || !inserted) {
      return fail("send_record", insertError ?? "record_missing");
    }

    let delivery: Awaited<ReturnType<typeof pushMessageWithOutcome>>;
    try {
      delivery = await pushMessageWithOutcome(customer.line_uid, [{
        type: "text",
        text: message,
      }], heartbeat.signal);
    } catch (error) {
      delivery = { outcome: "uncertain", error: errorCode(error) };
    }
    const { error: updateError } = await supabase
      .from("line_inbox_messages")
      .update({ delivery_status: delivery.outcome })
      .eq("id", inserted.id);
    if (updateError) {
      console.error("[staff-reply] delivery status update failed", {
        messageRecordId: String(inserted.id),
        delivery: delivery.outcome,
        errorCode: errorCode(updateError),
      });
    }

    const action = delivery.outcome === "accepted"
      ? "customer.reply_sent"
      : delivery.outcome === "uncertain"
      ? "customer.reply_uncertain"
      : "customer.reply_failed";
    const audited = await recordAudit(audit, {
      actor: { type: "staff" },
      action,
      entity: { type: "customer", id: customerId },
      after: {
        messageRecordId: String(inserted.id),
        delivery: delivery.outcome,
        deliveryStatusSaved: !updateError,
      },
      metadata: {
        messageLength: message.length,
        channel: "line",
        deliveryStatusSaved: !updateError,
      },
    });
    if (!audited) {
      return jsonResponse({
        ok: false,
        error: delivery.outcome === "accepted"
          ? "reply_sent_audit_failed"
          : "reply_audit_failed",
        delivery: delivery.outcome,
        statusSaved: !updateError,
      }, 500);
    }

    if (updateError) {
      if (delivery.outcome === "accepted") {
        return jsonResponse({
          ok: true,
          delivery: "accepted",
          messageId: String(inserted.id),
          statusSaved: false,
        });
      }
      return jsonResponse({
        ok: false,
        error: delivery.outcome === "uncertain"
          ? "line_push_uncertain"
          : "line_push_rejected",
        delivery: delivery.outcome,
        statusSaved: false,
      }, 502);
    }

    if (delivery.outcome !== "accepted") {
      return jsonResponse({
        ok: false,
        error: delivery.outcome === "uncertain"
          ? "line_push_uncertain"
          : "line_push_rejected",
        delivery: delivery.outcome,
      }, 502);
    }
    return jsonResponse({
      ok: true,
      delivery: "accepted",
      messageId: String(inserted.id),
      statusSaved: true,
    });
  } catch (error) {
    return fail("send", error);
  } finally {
    if (locked) {
      heartbeat?.stop();
      await releaseLineDelivery(supabase, customerId, claimToken!).catch(
        (error) => {
          console.error("[staff-reply] delivery lock release failed", {
            errorCode: errorCode(error),
          });
        },
      );
    }
  }
}

async function handleHistory(
  supabase: ReturnType<typeof createServiceClient>,
  body: { customerId?: string; offset?: number },
) {
  const customerId = body.customerId ?? "";
  const offset = body.offset ?? 0;
  if (!customerId) {
    return jsonResponse({ ok: false, error: "customer_id_required" }, 400);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
    return jsonResponse({ ok: false, error: "invalid_history_offset" }, 400);
  }

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("line_uid")
    .eq("id", customerId)
    .maybeSingle();
  if (fetchError) return fail("history_customer", fetchError);
  if (!customer?.line_uid) {
    return jsonResponse({ ok: false, error: "customer_not_found" }, 404);
  }

  const { data: rows, error } = await supabase
    .from("line_inbox_messages")
    .select(
      "id, event_id, role, message_type, content, delivery_status, created_at",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 100);
  if (error) return fail("history_messages", error);
  const page = rows ?? [];
  let messages = page.slice(0, 100).map((row) => ({
    id: String(row.id),
    role: row.role,
    messageType: row.message_type,
    content: row.content,
    deliveryStatus: row.delivery_status,
    timestamp: row.created_at,
    eventId: row.event_id,
  }));
  const hasMore = page.length > 100;

  if (offset === 0) {
    const { data: session, error: sessionError } = await supabase
      .from("line_chat_sessions")
      .select("history")
      .eq("user_id", customer.line_uid)
      .maybeSingle();
    if (sessionError) return fail("history_session", sessionError);
    messages = mergeLegacySessionHistory(messages, session?.history);
  } else {
    messages = mergeLegacySessionHistory(messages, null);
  }
  return jsonResponse({
    ok: true,
    messages,
    hasMore,
    nextOffset: offset + 100,
  });
}

async function handleAuditHistory(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string },
) {
  const customerId = body.customerId ?? "";
  const filters = customerId
    ? { entity: { type: "customer", id: customerId }, limit: 50 }
    : { limit: 50 };
  const result = await audit.query(filters);
  if (!result.success) return fail("audit_query", result.error);

  const records = result.records ?? [];
  const ids = [...new Set(records.map((record) => record.entity.id))];
  const { data: customers, error } = ids.length
    ? await supabase.from("customers").select("id, name").in("id", ids)
    : { data: [], error: null };
  if (error) return fail("audit_customers", error);
  const nameById = Object.fromEntries(
    (customers ?? []).map((customer) => [customer.id, customer.name]),
  );
  return jsonResponse({
    ok: true,
    records: records.map((record) => ({
      ...record,
      customerName: nameById[record.entity.id] ?? null,
    })),
    total: result.total,
  });
}

async function handleImage(
  supabase: ReturnType<typeof createServiceClient>,
  body: { customerId?: string; messageRecordId?: string },
) {
  const customerId = body.customerId ?? "";
  const messageRecordId = body.messageRecordId ?? "";
  if (!customerId || !/^\d{1,20}$/.test(messageRecordId)) {
    return jsonResponse({ ok: false, error: "image_reference_required" }, 400);
  }
  const { data: message, error } = await supabase
    .from("line_inbox_messages")
    .select("line_message_id")
    .eq("id", messageRecordId)
    .eq("customer_id", customerId)
    .eq("role", "customer")
    .eq("message_type", "image")
    .maybeSingle();
  if (error) return fail("image_lookup", error);
  if (!message?.line_message_id) {
    return jsonResponse({ ok: false, error: "image_not_found" }, 404);
  }

  try {
    const image = await downloadLineImageContent(message.line_message_id);
    const body = new ArrayBuffer(image.bytes.byteLength);
    new Uint8Array(body).set(image.bytes);
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error("[staff-reply] image proxy failed", {
      errorCode: errorCode(error),
    });
    return jsonResponse({ ok: false, error: "image_unavailable" }, 502);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const staffPasscode = Deno.env.get("STAFF_PASSCODE");
  const sessionSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!staffPasscode || !sessionSecret) {
    return jsonResponse({ ok: false, error: "staff_auth_unavailable" }, 500);
  }

  try {
    const supabase = createServiceClient();
    const suppliedSession = req.headers.get("x-staff-session");
    let sessionToIssue: string | null = null;
    if (suppliedSession) {
      if (
        !await staffSessionTokenMatches(
          suppliedSession,
          sessionSecret,
          staffPasscode,
        )
      ) {
        return jsonResponse({ ok: false, error: "staff_session_expired" }, 401);
      }
    } else {
      const clientIp = forwardedClientIp(req);
      if (!clientIp) {
        return jsonResponse(
          { ok: false, error: "staff_auth_unavailable" },
          503,
        );
      }
      const passcodeMatches = await staffPasscodeMatches(
        decodeStaffPasscodeHeader(
          req.headers.get("x-staff-key-b64"),
          req.headers.get("x-staff-key"),
        ),
        staffPasscode,
      );
      const ipHash = await staffIpFingerprint(clientIp, staffPasscode);
      const { data: authResult, error: authError } = await supabase.rpc(
        "line_staff_auth_attempt",
        { p_ip_hash: ipHash, p_success: passcodeMatches },
      );
      if (authError || typeof authResult !== "string") {
        return fail("staff_auth_rate_limit", authError ?? "invalid_result");
      }
      if (authResult === "blocked") {
        return jsonResponse({ ok: false, error: "too_many_attempts" }, 429);
      }
      if (authResult === "denied") {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }
      if (authResult !== "allowed") {
        return fail("staff_auth_rate_limit", "invalid_result");
      }
      sessionToIssue = await issueStaffSessionToken(
        sessionSecret,
        staffPasscode,
      );
    }

    const url = new URL(req.url);
    const action = url.pathname.replace(
      /^\/(functions\/v1\/)?staff-reply\//,
      "",
    );
    const body = await req.json().catch(() => ({}));
    const audit = createAuditLog({ store: new SupabaseAuditStore(supabase) });

    if (action === "list") {
      return attachStaffSession(
        await handleList(supabase, body),
        sessionToIssue,
      );
    }
    if (action === "history") {
      return attachStaffSession(
        await handleHistory(supabase, body),
        sessionToIssue,
      );
    }
    if (action === "takeover") {
      return attachStaffSession(
        await setHumanMode(supabase, body, true),
        sessionToIssue,
      );
    }
    if (action === "resume") {
      return attachStaffSession(
        await setHumanMode(supabase, body, false),
        sessionToIssue,
      );
    }
    if (action === "send") {
      return attachStaffSession(
        await handleSend(supabase, audit, body),
        sessionToIssue,
      );
    }
    if (action === "audit-log") {
      return attachStaffSession(
        await handleAuditHistory(supabase, audit, body),
        sessionToIssue,
      );
    }
    if (action === "image") {
      return attachStaffSession(
        await handleImage(supabase, body),
        sessionToIssue,
      );
    }
    return attachStaffSession(
      jsonResponse({ ok: false, error: "unknown_action" }, 404),
      sessionToIssue,
    );
  } catch (error) {
    return fail("request", error);
  }
});
