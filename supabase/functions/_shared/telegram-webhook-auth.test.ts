import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeTelegramWebhook,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
} from "./telegram-webhook-auth.ts";

const EXPECTED = "synthetic-telegram-webhook-secret";

function webhookRequest(secret?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret !== undefined) headers[TELEGRAM_WEBHOOK_SECRET_HEADER] = secret;
  return new Request("https://example.test/functions/v1/telegram-webhook", {
    method: "POST",
    headers,
    body: JSON.stringify({ update_id: 1 }),
  });
}

Deno.test("telegram webhook accepts a matching secret", async () => {
  const result = await authorizeTelegramWebhook(
    webhookRequest(EXPECTED),
    EXPECTED,
  );
  assertEquals(result, true);
});

Deno.test("telegram webhook rejects a mismatching secret", async () => {
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest("wrong-secret"), EXPECTED),
    false,
  );
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest(EXPECTED + "-x"), EXPECTED),
    false,
  );
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest(""), EXPECTED),
    false,
  );
});

Deno.test("telegram webhook rejects a missing expected secret or header", async () => {
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest(), EXPECTED),
    false,
  );
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest(EXPECTED), null),
    false,
  );
  assertEquals(
    await authorizeTelegramWebhook(webhookRequest(EXPECTED), ""),
    false,
  );
});
