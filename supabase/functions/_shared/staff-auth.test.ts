import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  forwardedClientIp,
  staffIpFingerprint,
  staffPasscodeMatches,
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
