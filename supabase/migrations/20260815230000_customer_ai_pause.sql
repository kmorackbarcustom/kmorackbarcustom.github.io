-- Staff reply to customers directly through LINE Official Account Manager, which fires no webhook
-- event our system can see - there's no way to auto-detect "a human just took over". This column
-- lets staff explicitly pause the AI for a specific customer via a Telegram command instead.
-- Lives on customers (persistent), not line_chat_sessions (subject to session TTL expiry - a pause
-- flag there would silently lift itself whenever the chat session expires, which isn't the intent).
alter table public.customers add column if not exists paused_until timestamptz;
