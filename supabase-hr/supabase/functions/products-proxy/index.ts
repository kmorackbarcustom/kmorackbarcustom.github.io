import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// KMO catalog admin proxy for HR Supabase project ybyseaenceyswjnwdmdf.
// Deploy this function to the HR project only.

const ALLOWED_ORIGIN = "https://kmorackbarcustom.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-staff-key, prefer, accept",
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
};

const allowedPaths = ["products"];
const allowedMethods = ["POST", "PATCH", "DELETE"];

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured on the server secrets.`);
  return value;
}

function isPathAllowed(path: string): boolean {
  const cleanPath = path.split("?")[0].replace(/\/$/, "");
  return allowedPaths.includes(cleanPath);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!allowedMethods.includes(req.method)) {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const staffPasscode = requiredEnv("STAFF_PASSCODE");
    const clientKey = req.headers.get("x-staff-key");
    if (clientKey !== staffPasscode) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid x-staff-key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(functions\/v1\/)?products-proxy\//, "");

    if (!isPathAllowed(path)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: Path '${path}' is not allowed by policy` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const targetUrl = `${supabaseUrl}/rest/v1/${path}${url.search}`;

    const headers = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const k = key.toLowerCase();
      if (["content-type", "prefer", "accept"].includes(k)) {
        headers.set(key, value);
      }
    }
    headers.set("apikey", serviceRoleKey);
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === "DELETE" ? undefined : await req.blob(),
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
    console.error("[products-proxy] failure:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
