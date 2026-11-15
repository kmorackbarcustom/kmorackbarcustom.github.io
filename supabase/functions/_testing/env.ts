// Fake env for offline tests. Set unconditionally so ambient real values never leak in. Import FIRST.
Deno.env.set("SUPABASE_URL", "https://fake.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role");
Deno.env.set("TELEGRAM_BOT_TOKEN", "fake-telegram-token");
Deno.env.set("TELEGRAM_CHAT_ID", "fake-staff-chat");
Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", "fake-line-token");
