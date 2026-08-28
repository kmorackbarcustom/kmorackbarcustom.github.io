import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createServiceClient, requiredEnv } from "../_shared/database.ts";

const ALLOWED_ORIGIN = "https://kmorackbarcustom.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-key, prefer, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

// 🔒 LOCKED (CEO instruction 2026-08-28): this allowlist gates service_role access for the whole
// shop. Do NOT add/remove/reorder entries, and do not widen a path's HTTP methods (see
// isPathAllowed's GET-only carve-out for system_settings below), without asking the CEO first and
// laying out the pros/cons/blast-radius. This is the exact policy that silently locked staff out
// for 2 days (2026-08-26 → 08-28, see commits fdf6ff9/35582f5) — next time, ask before touching it.
const allowedPaths = [
  "orders",
  "bookings",
  "vehicle_intake_forms",
  "shop_faqs",
  "products",
  "rpc/update_order_status",
  "rpc/update_shopee_deadline",
  "rpc/get_schedule_health",
  "rpc/match_and_link_uid",
  "rpc/update_shop_config_setting",
];

type StaffPasscodeVerifier = {
  algorithm: "pbkdf2-sha256";
  iterations: number;
  saltHex: string;
  hashHex: string;
};
// ponytail: this is a PBKDF2 hash, one-way — if you rotate system_settings.staff_passcode_verifier,
// the plaintext passcode CANNOT be recovered afterward. Update D:\AI-Workspace\.secrets\keys.txt
// (KMO_STAFF_PASSCODE — also gates the separate staff-reply function's STAFF_PASSCODE secret, keep
// both in sync) with the new value FIRST, or staff get locked out of admin-shop-config/
// AdminOrderDashboard/bookingdashboard/vehicle-intake like 2026-08-26 → 2026-08-28.
const VERIFIER_SETTING_KEY = "staff_passcode_verifier";
const VERIFIER_CACHE_MS = 5 * 60 * 1000;
let cachedVerifier: StaffPasscodeVerifier | null = null;
let verifierCachedAt = 0;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid staff passcode verifier hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function parseVerifier(raw: unknown): StaffPasscodeVerifier {
  if (typeof raw !== "string") throw new Error("Staff passcode verifier is missing");
  const parsed = JSON.parse(raw) as Partial<StaffPasscodeVerifier>;
  if (
    parsed.algorithm !== "pbkdf2-sha256" ||
    !Number.isInteger(parsed.iterations) ||
    (parsed.iterations ?? 0) < 100000 ||
    typeof parsed.saltHex !== "string" ||
    typeof parsed.hashHex !== "string"
  ) {
    throw new Error("Staff passcode verifier is invalid");
  }
  hexToBytes(parsed.saltHex);
  const expectedHash = hexToBytes(parsed.hashHex);
  if (expectedHash.length !== 32) throw new Error("Staff passcode verifier hash length is invalid");
  return parsed as StaffPasscodeVerifier;
}

async function loadStaffPasscodeVerifier(): Promise<StaffPasscodeVerifier> {
  const now = Date.now();
  if (cachedVerifier && now - verifierCachedAt < VERIFIER_CACHE_MS) return cachedVerifier;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", VERIFIER_SETTING_KEY)
    .maybeSingle();

  if (error) throw new Error(`Failed to load staff passcode verifier: ${error.message}`);
  cachedVerifier = parseVerifier(data?.value);
  verifierCachedAt = now;
  return cachedVerifier;
}

async function isValidStaffPasscode(input: string | null): Promise<boolean> {
  if (!input) return false;
  const verifier = await loadStaffPasscodeVerifier();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: hexToBytes(verifier.saltHex),
    iterations: verifier.iterations,
  }, keyMaterial, 256));
  return constantTimeEqual(derived, hexToBytes(verifier.hashHex));
}

function isPathAllowed(path: string, method: string): boolean {
  const cleanPath = path.split("?")[0].replace(/\/$/, "");
  if (allowedPaths.includes(cleanPath)) return true;
  if (cleanPath.startsWith("storage/v1/object/vehicle-intake-images")) return true;
  if (cleanPath.startsWith("storage/v1/object/product-images")) return true;
  if (cleanPath.startsWith("storage/v1/object/booking-images")) return true;
  // ponytail: read-only. system_settings also holds staff_passcode_verifier and other rows this
  // page has no business touching — writes MUST stay routed through rpc/update_shop_config_setting
  // (security definer, 6-key allowlist). Do not add PATCH/POST/DELETE here.
  if (cleanPath === "system_settings" && method === "GET") return true;
  return false;
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const clientKey = req.headers.get("x-staff-key");
    if (!(await isValidStaffPasscode(clientKey))) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid x-staff-key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?internal-proxy\//, "");
    if (!isPathAllowed(path, req.method)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: Path '${path}' is not allowed by policy` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      if (["content-type", "prefer", "accept", "range"].includes(k)) headers.set(key, value);
    }
    headers.set("apikey", serviceRoleKey);
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);

    let body: BodyInit | undefined;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) body = await req.blob();

    const backendRes = await fetch(targetUrl, { method: req.method, headers, body });
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
      JSON.stringify({ error: "Internal proxy unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
