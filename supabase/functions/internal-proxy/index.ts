import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requiredEnv } from "../_shared/database.ts";

// ponytail: shared shop passcode gate, not per-user auth — proportionate for
// a small internal tool the shop wants zero-friction. Upgrade to real
// Supabase Auth if per-staff audit trail is ever needed.

const ALLOWED_ORIGIN = "https://kmorackbarcustom.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-key, prefer, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

// เฉพาะ table/rpc ที่ 3 หน้า admin (AdminOrderDashboard, bookingdashboard,
// vehicle-intake) ใช้จริงเท่านั้น — ถ้า staff key หลุด จะได้จำกัดความเสียหาย
// ไม่เท่ากับเปิด service_role เต็มระบบ
const allowedPaths = [
  "orders",
  "bookings",
  "vehicle_intake_forms",
  "shop_faqs",
  "rpc/update_order_status",
  "rpc/update_shopee_deadline",
  "rpc/get_schedule_health",
  "rpc/match_and_link_uid",
  "rpc/update_shop_config_setting",
];

function isPathAllowed(path: string): boolean {
  const cleanPath = path.split("?")[0].replace(/\/$/, "");

  if (allowedPaths.includes(cleanPath)) {
    return true;
  }

  // vehicle-intake tool อัปโหลด/ลบ/ดูรูปผ่าน proxy เพราะ bucket เป็น private
  if (cleanPath.startsWith("storage/v1/object/vehicle-intake-images")) {
    return true;
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const staffPasscode = Deno.env.get("STAFF_PASSCODE");
    if (!staffPasscode) {
      return new Response(
        JSON.stringify({ error: "STAFF_PASSCODE is not configured on the server secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientKey = req.headers.get("x-staff-key");
    if (clientKey !== staffPasscode) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid x-staff-key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    // ponytail: edge runtime เห็น pathname แบบ /internal-proxy/... (ไม่มี /functions/v1 นำหน้า)
    // ตัด prefix ทั้งสองแบบกันไว้เผื่อ routing เปลี่ยนพฤติกรรมอีก
    const path = url.pathname.replace(/^\/(functions\/v1\/)?internal-proxy\//, "");

    if (!isPathAllowed(path)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: Path '${path}' is not allowed by policy` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const targetUrl = path.startsWith("storage/")
      ? `${supabaseUrl}/${path}${url.search}`
      : `${supabaseUrl}/rest/v1/${path}${url.search}`;

    console.log(`[internal-proxy] ${req.method} -> ${targetUrl}`);

    const headers = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const k = key.toLowerCase();
      if (["content-type", "prefer", "accept", "range"].includes(k)) {
        headers.set(key, value);
      }
    }
    headers.set("apikey", serviceRoleKey);
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);

    let body: BodyInit | undefined = undefined;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      body = await req.blob();
    }

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseBody = await backendRes.blob();

    const resHeaders = new Headers(corsHeaders);
    for (const [key, value] of backendRes.headers.entries()) {
      const k = key.toLowerCase();
      if (!["access-control-allow-origin", "content-encoding", "transfer-encoding"].includes(k)) {
        resHeaders.set(key, value);
      }
    }

    return new Response(responseBody, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("[internal-proxy] failure:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
