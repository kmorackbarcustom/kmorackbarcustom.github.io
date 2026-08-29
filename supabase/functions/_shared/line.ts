import { requiredEnv } from "./database.ts";
import { createHttpClient } from "./vendor/http-client/index.ts";
import { GenericHmacVerifier } from "./vendor/webhook-receiver/providers/generic-hmac/index.ts";

const LINE_API_BASE = "https://api.line.me/v2/bot";

export async function verifyLineSignature(
  rawBody: string,
  signatureHeaderValue: string | null,
): Promise<boolean> {
  if (!signatureHeaderValue) return false;
  const verifier = new GenericHmacVerifier({
    secret: requiredEnv("LINE_CHANNEL_SECRET"),
    signatureHeader: "x-line-signature",
    algorithm: "SHA-256",
    encoding: "base64",
  });
  const result = await verifier.verify({
    rawBody,
    headers: { "x-line-signature": signatureHeaderValue },
  });
  return result.valid === true;
}

export const LINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export type LineImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type LineImageContent = {
  bytes: Uint8Array;
  mimeType: LineImageMimeType;
  byteLength: number;
};

export class LineContentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LineContentError";
  }
}

export function detectImageMimeType(
  bytes: Uint8Array,
): LineImageMimeType | null {
  if (
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) =>
      bytes[i] === v
    )
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

async function readBodyBounded(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    throw new LineContentError(
      "empty_body",
      "LINE content response has no body",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("image too large").catch(() => undefined);
        throw new LineContentError(
          "too_large",
          `LINE image exceeds ${maxBytes} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function downloadLineImageContent(
  messageId: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } =
    {},
): Promise<LineImageContent> {
  if (!messageId.trim()) {
    throw new LineContentError(
      "invalid_message_id",
      "LINE message id is required",
    );
  }
  const maxBytes = options.maxBytes ?? LINE_IMAGE_MAX_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetchImpl(
      `https://api-data.line.me/v2/bot/message/${
        encodeURIComponent(messageId)
      }/content`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${requiredEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new LineContentError(
        "http_error",
        `LINE content API failed with ${response.status}`,
        response.status,
      );
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new LineContentError(
        "too_large",
        `LINE image exceeds ${maxBytes} bytes`,
      );
    }
    const bytes = await readBodyBounded(response, maxBytes);
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) {
      throw new LineContentError(
        "unsupported_type",
        "LINE content is not JPEG, PNG, or WebP",
      );
    }
    return { bytes, mimeType, byteLength: bytes.byteLength };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LineContentError("timeout", "LINE content download timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

type LineMessage = { type: "text"; text: string };

async function callLineApi(
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    await createHttpClient({ defaultTimeoutMs: 8000 }).request({
      url: `${LINE_API_BASE}${path}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
      },
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

export async function getProfile(
  userId: string,
): Promise<{ displayName?: string } | null> {
  try {
    const res = await createHttpClient({ defaultTimeoutMs: 8000 }).request<
      { displayName?: string }
    >({
      url: `${LINE_API_BASE}/profile/${userId}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${requiredEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
      },
    });
    return res.data ?? null;
  } catch (error) {
    console.error("[line] getProfile failed", error);
    return null;
  }
}
