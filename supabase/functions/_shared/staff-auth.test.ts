import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decodeStaffPasscodeHeader,
  forwardedClientIp,
  issueStaffSessionToken,
  staffIpFingerprint,
  staffPasscodeMatches,
  staffSessionTokenMatches,
} from "./staff-auth.ts";

Deno.test("staff authentication helpers normalize and conceal client identity", async () => {
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assertEquals(forwardedClientIp(request), "203.0.113.9");
  assertEquals(
    forwardedClientIp(new Request("https://example.test")),
    null,
  );

  const fingerprint = await staffIpFingerprint(
    "203.0.113.9",
    "synthetic-test-passcode",
  );
  assertEquals(/^[0-9a-f]{64}$/.test(fingerprint), true);
  assertEquals(fingerprint.includes("203.0.113.9"), false);
  assertEquals(
    await staffIpFingerprint("203.0.113.9", "other-test-passcode") ===
      fingerprint,
    false,
  );
});

Deno.test("staff passcode comparison handles equal and unequal lengths", async () => {
  assertEquals(
    await staffPasscodeMatches("synthetic-passcode", "synthetic-passcode"),
    true,
  );
  assertEquals(
    await staffPasscodeMatches("synthetic-passcode", "other-passcode"),
    false,
  );
  assertEquals(await staffPasscodeMatches("short", "longer-passcode"), false);
});

Deno.test("staff session token is signed, tamper-resistant, and expires", async () => {
  const now = 1_800_000_000_000;
  const token = await issueStaffSessionToken(
    "synthetic-service-secret",
    "synthetic-passcode",
    now,
  );
  assertEquals(
    await staffSessionTokenMatches(
      token,
      "synthetic-service-secret",
      "synthetic-passcode",
      now,
    ),
    true,
  );
  assertEquals(
    await staffSessionTokenMatches(
      token,
      "different-secret",
      "synthetic-passcode",
      now,
    ),
    false,
  );
  assertEquals(
    await staffSessionTokenMatches(
      token,
      "synthetic-service-secret",
      "rotated-passcode",
      now,
    ),
    false,
  );
  assertEquals(
    await staffSessionTokenMatches(
      token,
      "synthetic-service-secret",
      "synthetic-passcode",
      now + 8 * 60 * 60 * 1000,
    ),
    false,
  );
  assertEquals(
    await staffSessionTokenMatches(
      `${token.slice(0, -1)}x`,
      "synthetic-service-secret",
      "synthetic-passcode",
      now,
    ),
    false,
  );
});

Deno.test("staff passcode header decodes UTF-8 and preserves legacy callers", () => {
  const bytes = new TextEncoder().encode("รหัสทดสอบ-123");
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assertEquals(decodeStaffPasscodeHeader(encoded, null), "รหัสทดสอบ-123");
  assertEquals(
    decodeStaffPasscodeHeader(null, "legacy-test-passcode"),
    "legacy-test-passcode",
  );
  assertEquals(decodeStaffPasscodeHeader("_w", null), "");
  assertEquals(
    decodeStaffPasscodeHeader("bad+header", "fallback-must-not-be-used"),
    "",
  );
});
