import { timingSafeEqual } from "./vendor/webhook-receiver/core/errors.ts";

export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

export async function authorizeTelegramWebhook(
  request: Request,
  expectedSecret: string | null | undefined,
): Promise<boolean> {
  const suppliedSecret = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER);
  if (!expectedSecret || !suppliedSecret) return false;

  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(suppliedSecret)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedSecret)),
  ]);
  return timingSafeEqual(
    new Uint8Array(suppliedHash),
    new Uint8Array(expectedHash),
  );
}
