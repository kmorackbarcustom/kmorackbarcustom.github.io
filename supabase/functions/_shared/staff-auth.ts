import { timingSafeEqual } from "./vendor/webhook-receiver/core/errors.ts";

const encoder = new TextEncoder();
const STAFF_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function staffSessionSignature(
  payload: string,
  secret: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
}

async function staffSessionSecret(
  serviceSecret: string,
  passcode: string,
): Promise<string> {
  return base64Url(
    await staffSessionSignature(
      `kmo-staff-session-v1:${passcode}`,
      serviceSecret,
    ),
  );
}

export async function issueStaffSessionToken(
  serviceSecret: string,
  passcode: string,
  now = Date.now(),
): Promise<string> {
  const expiresAt = now + STAFF_SESSION_TTL_MS;
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${expiresAt}.${nonce}`;
  const secret = await staffSessionSecret(serviceSecret, passcode);
  return `${payload}.${
    base64Url(await staffSessionSignature(payload, secret))
  }`;
}

export async function staffSessionTokenMatches(
  token: string,
  serviceSecret: string,
  passcode: string,
  now = Date.now(),
): Promise<boolean> {
  const [expiresText, nonce, signature, extra] = token.split(".");
  const expiresAt = Number(expiresText);
  if (
    extra !== undefined || !/^\d{13}$/.test(expiresText ?? "") ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "") ||
    expiresAt <= now || expiresAt > now + STAFF_SESSION_TTL_MS
  ) return false;

  const secret = await staffSessionSecret(serviceSecret, passcode);
  const expected = await staffSessionSignature(
    `${expiresText}.${nonce}`,
    secret,
  );
  let supplied: Uint8Array;
  try {
    const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    supplied = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return false;
  }
  return timingSafeEqual(expected, supplied);
}

export function forwardedClientIp(request: Request): string | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim();
  return ip && ip.length <= 45 && /^[0-9a-f:.]+$/i.test(ip)
    ? ip.toLowerCase()
    : null;
}

export async function staffIpFingerprint(
  ip: string,
  passcode: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(ip)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function staffPasscodeMatches(
  supplied: string,
  expected: string,
): Promise<boolean> {
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(
    new Uint8Array(suppliedHash),
    new Uint8Array(expectedHash),
  );
}

export function decodeStaffPasscodeHeader(
  encoded: string | null,
  legacy: string | null,
): string {
  if (encoded === null) return legacy ?? "";
  if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) return "";
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}
