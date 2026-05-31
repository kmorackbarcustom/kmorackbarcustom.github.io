import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export type Settings = Record<string, string>;

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createServiceClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getSettings(supabase: ReturnType<typeof createServiceClient>): Promise<Settings> {
  const { data, error } = await supabase.from("system_settings").select("key,value");
  if (error) {
    throw error;
  }

  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function publicSupabaseUrl(): string {
  return requiredEnv("SUPABASE_URL").replace(/\/$/, "");
}
