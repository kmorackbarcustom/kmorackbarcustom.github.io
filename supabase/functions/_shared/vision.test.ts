import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analyzeImageWithGemma,
  formatVisionObservation,
  parseVisionObservation,
  type VisionObservation,
} from "./vision.ts";

const valid: VisionObservation = {
  summary: "รถมอเตอร์ไซค์สีดำติดแร็คท้าย",
  visible_text: ["KMO 27"],
  vehicle_or_part_hints: [{ label: "rear rack", confidence: "medium" }],
  notable_details: ["มีโครงเหล็กด้านท้าย"],
  uncertainties: ["ไม่ยืนยันรุ่นรถจากภาพเดียว"],
};
const validJson = JSON.stringify(valid);
const image = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x01]),
  mimeType: "image/jpeg" as const,
};

Deno.test("parseVisionObservation accepts valid and fenced JSON", () => {
  assertEquals(parseVisionObservation(validJson), valid);
  assertEquals(
    parseVisionObservation("```json\n" + validJson + "\n```"),
    valid,
  );
});

Deno.test("parseVisionObservation rejects invalid shape, empty and degenerate content", () => {
  assertThrows(() => parseVisionObservation('{"summary":"x"}'));
  assertThrows(() => parseVisionObservation(""));
  assertThrows(() => parseVisionObservation("a a a a a a a a"));
  assertThrows(() =>
    parseVisionObservation(JSON.stringify({ ...valid, extra: "x" }))
  );
});

Deno.test("formatVisionObservation marks data untrusted and never adds image payload", () => {
  const text = formatVisionObservation(valid);
  assert(text.includes("อาจคลาดเคลื่อน"));
  assert(text.includes("business truth"));
  assertEquals(text.includes("base64"), false);
  assertEquals(text.includes("data:image"), false);
});
Deno.test("analyzeImageWithGemma parses provider JSON and sends a data URL only to provider", async () => {
  let sawImage = false;
  const fetchImpl =
    (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const url = body.messages?.[1]?.content?.[1]?.image_url?.url;
      sawImage = typeof url === "string" &&
        url.startsWith("data:image/jpeg;base64,");
      return Response.json({ choices: [{ message: { content: validJson } }] });
    }) as typeof fetch;

  const result = await analyzeImageWithGemma(image, {
    fetchImpl,
    apiKey: "test",
  });
  assertEquals(result, valid);
  assertEquals(sawImage, true);
});

Deno.test("analyzeImageWithGemma rejects provider non-2xx", async () => {
  await assertRejects(
    () =>
      analyzeImageWithGemma(image, {
        apiKey: "test",
        fetchImpl: (async () =>
          new Response("bad", { status: 503 })) as typeof fetch,
      }),
    Error,
    "503",
  );
});

Deno.test("analyzeImageWithGemma rejects provider timeout", async () => {
  const never =
    ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      })) as typeof fetch;
  await assertRejects(
    () =>
      analyzeImageWithGemma(image, {
        apiKey: "test",
        fetchImpl: never,
        timeoutMs: 5,
      }),
    Error,
    "timeout",
  );
});
