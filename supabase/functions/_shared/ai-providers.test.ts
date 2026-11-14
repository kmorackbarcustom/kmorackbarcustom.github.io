import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  containsUnstructuredToolCall,
  generateLineReplyAgent,
  isDegenerateText,
  OLLAMA_MODEL,
} from "./ai-providers.ts";

const lineTools = [{
  type: "function" as const,
  function: { name: "search_products", description: "", parameters: {} },
}];
const agentInput = {
  userMessage: "ราคาเท่าไร",
  history: [],
  systemPrompt: "ตอบเป็นภาษาไทย",
  tools: lineTools,
  runTool: () => Promise.resolve(""),
};

Deno.test("blocks internal tool calls returned as customer-facing prose", () => {
  assertEquals(
    containsUnstructuredToolCall(
      "เรียกใช้เครื่องมือ `search_products` ด้วย `query='แร็คท้าย'`",
      lineTools,
    ),
    true,
  );
  assertEquals(
    containsUnstructuredToolCall("ราคา 8,500 บาทครับ", lineTools),
    false,
  );
});

Deno.test("agent fails closed on provider errors, truncation, and tool-call prose", async () => {
  Deno.env.set("OLLAMA_API_KEY", "test-only");
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const mockResponse = (status: number, body: unknown) => {
    fetchCount = 0;
    globalThis.fetch = () => {
      fetchCount++;
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    };
  };
  try {
    mockResponse(401, { error: { message: "Unauthorized" } });
    await assertRejects(
      () => generateLineReplyAgent(agentInput),
      Error,
      "Ollama Cloud error (401)",
    );
    assertEquals(fetchCount, 1);

    mockResponse(200, {
      choices: [{ finish_reason: "length", message: { content: "partial" } }],
    });
    await assertRejects(
      () => generateLineReplyAgent(agentInput),
      Error,
      "output was truncated",
    );
    assertEquals(fetchCount, 1);

    mockResponse(200, {
      choices: [{
        finish_reason: "stop",
        message: {
          content: "เรียกใช้เครื่องมือ `search_products` ด้วย `query='แร็คท้าย'`",
        },
      }],
    });
    await assertRejects(
      () => generateLineReplyAgent(agentInput),
      Error,
      "unstructured tool-call text",
    );
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Ollama agent uses the owner-selected dated model tag", () => {
  assertEquals(OLLAMA_MODEL, "deepseek-v4.1-flash:1017-cloud");
});

Deno.test("isDegenerateText flags token loops", () => {
  assert(isDegenerateText("a a a a a a a a"));
  assert(isDegenerateText("aaaaaaaaaaaa"));
  assert(isDegenerateText("งะงะงะงะงะงะงะงะงะงะ"));
});

Deno.test("isDegenerateText passes real replies", () => {
  for (
    const t of [
      "แร็คหลังคา Ford Ranger ราคา 8,500 บาทครับ ส่วนงานของลูกค้าตอนนี้กำลังทำครับ",
      "ขออภัยครับ ไม่พบข้อมูลในระบบ เดี๋ยวให้ทีมงานติดต่อกลับ รบกวนขอชื่อและเบอร์โทรครับ",
      "สวัสดีครับ ร้าน Kmo Rack Bar Custom รับแต่งรถกระบะ ทำแร็คและบาร์คัสตอมครับ",
      "ครับ ครับ ครับ",
      "ร้านเปิด 8.00-18.00 น. 🔥หยุดทุกวันอังคารครับ🔥",
    ]
  ) {
    assertEquals(isDegenerateText(t), false, t);
  }
});
