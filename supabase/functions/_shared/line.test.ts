import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectImageMimeType,
  downloadLineImageContent,
  LineContentError,
} from "./line.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
const png = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x01,
]);
const webp = new Uint8Array([
  0x52,
  0x49,
  0x46,
  0x46,
  0x01,
  0x00,
  0x00,
  0x00,
  0x57,
  0x45,
  0x42,
  0x50,
]);

Deno.test("detectImageMimeType accepts JPEG PNG WebP and rejects arbitrary data", () => {
  assertEquals(detectImageMimeType(jpeg), "image/jpeg");
  assertEquals(detectImageMimeType(png), "image/png");
  assertEquals(detectImageMimeType(webp), "image/webp");
  assertEquals(
    detectImageMimeType(new TextEncoder().encode("<svg></svg>")),
    null,
  );
  assertEquals(
    detectImageMimeType(new TextEncoder().encode("plain text")),
    null,
  );
});

Deno.test("downloadLineImageContent returns exact bytes and magic-detected MIME", async () => {
  const result = await downloadLineImageContent("abc/123", {
    fetchImpl: (async (url: string | URL | Request) => {
      assertEquals(String(url).includes("abc%2F123"), true);
      return new Response(png, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as typeof fetch,
  });
  assertEquals(result.mimeType, "image/png");
  assertEquals(result.byteLength, png.byteLength);
  assertEquals([...result.bytes], [...png]);
});
Deno.test("downloadLineImageContent rejects non-2xx", async () => {
  await assertRejects(
    () =>
      downloadLineImageContent("x", {
        fetchImpl: (async () =>
          new Response("no", { status: 404 })) as typeof fetch,
      }),
    LineContentError,
    "404",
  );
});

Deno.test("downloadLineImageContent rejects declared oversize before reading", async () => {
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": "5" }),
    get body(): ReadableStream<Uint8Array> {
      throw new Error("body must not be accessed");
    },
  } as unknown as Response;
  await assertRejects(
    () =>
      downloadLineImageContent("x", {
        maxBytes: 4,
        fetchImpl: (async () => response) as typeof fetch,
      }),
    LineContentError,
    "exceeds",
  );
});

Deno.test("downloadLineImageContent enforces streamed byte cap", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5]));
      controller.close();
    },
  });
  await assertRejects(
    () =>
      downloadLineImageContent("x", {
        maxBytes: 4,
        fetchImpl: (async () =>
          new Response(body, { status: 200 })) as typeof fetch,
      }),
    LineContentError,
    "exceeds",
  );
});
Deno.test("downloadLineImageContent rejects unsupported binary", async () => {
  await assertRejects(
    () =>
      downloadLineImageContent("x", {
        fetchImpl: (async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
          })) as typeof fetch,
      }),
    LineContentError,
    "not JPEG, PNG, or WebP",
  );
});

Deno.test("downloadLineImageContent times out", async () => {
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
    () => downloadLineImageContent("x", { fetchImpl: never, timeoutMs: 5 }),
    LineContentError,
    "timed out",
  );
});
