import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient } from "../_shared/database.ts";
import { SupabaseAuditStore } from "../_shared/audit-log-store.ts";
import { pushMessage } from "../_shared/line.ts";
import { createAuditLog } from "../_shared/vendor/audit-log/core/index.ts";

// ponytail: LINE gives zero signal when staff reply via LINE Official Account
// Manager - no webhook, no queryable state. This function is the workaround
// every omnichannel-inbox vendor uses: route staff replies through our own
// API call so pausing the bot is synchronous with sending, not detected.

const ALLOWED_ORIGIN = "https://kmorackbarcustom.github.io";
const PAUSE_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function handleList(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, line_display_name, phone, paused_until")
    .not("line_uid", "is", null)
    .order("name")
    .limit(500);
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  return jsonResponse({ ok: true, matches: data ?? [] });
}

async function handleSend(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string; message?: string },
) {
  const customerId = body.customerId ?? "";
  const message = (body.message ?? "").trim();
  if (!customerId || !message) return jsonResponse({ ok: false, error: "customerId and message are required" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return jsonResponse({ ok: false, error: "message too long" }, 400);

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, line_uid")
    .eq("id", customerId)
    .maybeSingle();
  if (fetchError) return jsonResponse({ ok: false, error: fetchError.message }, 500);
  if (!customer?.line_uid) return jsonResponse({ ok: false, error: "customer not found or has no line_uid" }, 404);

  const sent = await pushMessage(customer.line_uid, [{ type: "text", text: message }]);
  if (!sent) return jsonResponse({ ok: false, error: "line_push_failed" }, 502);

  const pausedUntil = new Date(Date.now() + PAUSE_MS).toISOString();
  const { error: updateError } = await supabase.from("customers").update({ paused_until: pausedUntil }).eq("id", customerId);
  if (updateError) return jsonResponse({ ok: false, error: updateError.message }, 500);

  const auditResult = await audit.record({
    actor: { type: "staff" },
    action: "customer.reply_sent",
    entity: { type: "customer", id: customerId },
    after: { message, pausedUntil },
    metadata: { messageLength: message.length, channel: "line" },
  });
  if (!auditResult.success) console.error("[staff-reply] audit record failed", auditResult.error);

  return jsonResponse({ ok: true, pausedUntil });
}

async function handleResume(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string },
) {
  const customerId = body.customerId ?? "";
  if (!customerId) return jsonResponse({ ok: false, error: "customerId is required" }, 400);

  const { error } = await supabase.from("customers").update({ paused_until: null }).eq("id", customerId);
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const auditResult = await audit.record({
    actor: { type: "staff" },
    action: "customer.ai_resumed",
    entity: { type: "customer", id: customerId },
    after: { pausedUntil: null },
    metadata: { channel: "staff-reply" },
  });
  if (!auditResult.success) console.error("[staff-reply] audit record failed", auditResult.error);

  return jsonResponse({ ok: true });
}

type ChatMessage = { role: "customer" | "ai" | "staff"; content: string; timestamp: string };

async function handleHistory(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string },
) {
  const customerId = body.customerId ?? "";
  if (!customerId) return jsonResponse({ ok: false, error: "customerId is required" }, 400);

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("line_uid")
    .eq("id", customerId)
    .maybeSingle();
  if (fetchError) return jsonResponse({ ok: false, error: fetchError.message }, 500);
  if (!customer?.line_uid) return jsonResponse({ ok: false, error: "customer not found or has no line_uid" }, 404);

  const [{ data: session, error: sessionError }, auditResult] = await Promise.all([
    supabase.from("line_chat_sessions").select("history").eq("user_id", customer.line_uid).maybeSingle(),
    audit.query({ entity: { type: "customer", id: customerId }, limit: 50 }),
  ]);
  if (sessionError) return jsonResponse({ ok: false, error: sessionError.message }, 500);
  if (!auditResult.success) return jsonResponse({ ok: false, error: auditResult.error?.message ?? "query_failed" }, 500);

  const chatTurns: ChatMessage[] = ((session?.history ?? []) as { role: string; content: string; timestamp: number }[]).map(
    (h) => ({
      role: h.role === "assistant" ? "ai" : "customer",
      content: h.content,
      timestamp: new Date(h.timestamp).toISOString(),
    }),
  );
  const staffTurns: ChatMessage[] = (auditResult.records ?? [])
    .filter((r) => r.action === "customer.reply_sent")
    .map((r) => ({ role: "staff", content: (r.after as { message?: string })?.message ?? "", timestamp: r.timestamp }));

  const messages = [...chatTurns, ...staffTurns].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return jsonResponse({ ok: true, messages });
}

async function handleAuditHistory(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  body: { customerId?: string },
) {
  const customerId = body.customerId ?? "";
  const filters = customerId ? { entity: { type: "customer", id: customerId }, limit: 50 } : { limit: 50 };
  const result = await audit.query(filters);
  if (!result.success) return jsonResponse({ ok: false, error: result.error?.message ?? "query_failed" }, 500);

  const records = result.records ?? [];
  const ids = [...new Set(records.map((r) => r.entity.id))];
  const { data: customers } = ids.length
    ? await supabase.from("customers").select("id, name").in("id", ids)
    : { data: [] };
  const nameById = Object.fromEntries((customers ?? []).map((c) => [c.id, c.name]));
  const withNames = records.map((r) => ({ ...r, customerName: nameById[r.entity.id] ?? null }));

  return jsonResponse({ ok: true, records: withNames, total: result.total });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const staffPasscode = Deno.env.get("STAFF_PASSCODE");
    if (!staffPasscode) {
      return jsonResponse({ error: "STAFF_PASSCODE is not configured on the server secrets." }, 500);
    }
    if (req.headers.get("x-staff-key") !== staffPasscode) {
      return jsonResponse({ error: "Unauthorized: Invalid x-staff-key" }, 401);
    }

    const url = new URL(req.url);
    const action = url.pathname.replace(/^\/(functions\/v1\/)?staff-reply\//, "");
    const body = await req.json().catch(() => ({}));
    const supabase = createServiceClient();
    const audit = createAuditLog({ store: new SupabaseAuditStore(supabase) });

    if (action === "list") return await handleList(supabase);
    if (action === "send") return await handleSend(supabase, audit, body);
    if (action === "resume") return await handleResume(supabase, audit, body);
    if (action === "audit-log") return await handleAuditHistory(supabase, audit, body);
    if (action === "history") return await handleHistory(supabase, audit, body);

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (error) {
    console.error("[staff-reply] failure:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
