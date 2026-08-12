import { requiredEnv } from "./database.ts";
import { createHttpClient } from "./vendor/http-client/index.ts";
import { GenericHmacVerifier } from "./vendor/webhook-receiver/providers/generic-hmac/index.ts";

const LINE_API_BASE = "https://api.line.me/v2/bot";

export async function verifyLineSignature(rawBody: string, signatureHeaderValue: string | null): Promise<boolean> {
  if (!signatureHeaderValue) return false;
  const verifier = new GenericHmacVerifier({
    secret: requiredEnv("LINE_CHANNEL_SECRET"),
    signatureHeader: "x-line-signature",
    algorithm: "SHA-256",
    encoding: "base64",
  });
  const result = await verifier.verify({ rawBody, headers: { "x-line-signature": signatureHeaderValue } });
  return result.valid === true;
}

type LineMessage = { type: "text"; text: string };

async function callLineApi(path: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    await createHttpClient({ defaultTimeoutMs: 8000 }).request({
      url: `${LINE_API_BASE}${path}`,
      method: "POST",
      headers: { Authorization: `Bearer ${requiredEnv("LINE_CHANNEL_ACCESS_TOKEN")}` },
      body,
    });
    return true;
  } catch (error) {
    console.error(`[line] ${path} failed`, error);
    return false;
  }
}

export const replyMessage = (replyToken: string, messages: LineMessage[]) =>
  callLineApi("/message/reply", { replyToken, messages });
export const pushMessage = (to: string, messages: LineMessage[]) =>
  callLineApi("/message/push", { to, messages });
