import { timingSafeEqual } from "./vendor/webhook-receiver/core/errors.ts";

const encoder = new TextEncoder();

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
