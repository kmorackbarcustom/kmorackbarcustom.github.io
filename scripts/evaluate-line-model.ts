import { generateLineReplyAgent } from "../supabase/functions/_shared/ai-providers.ts";
import { buildLineSystemPrompt } from "../supabase/functions/_shared/line-ai-prompt.ts";
import { LINE_AGENT_TOOLS } from "../supabase/functions/_shared/line-agent-tools.ts";
import {
  CUSTOMER_ORDER_URL,
  LIFF_BOOKING_URL,
} from "../supabase/functions/_shared/constants.ts";

type Scenario = {
  id: string;
  message: string;
  requiredTools: string[];
  forbiddenTools?: string[];
  validateReply: (reply: string) => string[];
};

const settings = {
  shop_name: "ร้าน KMO",
  shop_address: "กรุงเทพมหานคร",
};
const systemPrompt = buildLineSystemPrompt(settings, []);
const toolCalls: Array<
  { scenario: string; tool: string; args: Record<string, unknown> }
> = [];

const scenarios: Scenario[] = [
  {
    id: "order-status",
    message: "ออเดอร์ของผมถึงไหนแล้วครับ",
    requiredTools: ["get_order_status"],
    validateReply: (reply) =>
      reply.includes("กำลังผลิต") ? [] : ["missing fixture-backed order status"],
  },
  {
    id: "product-price-and-order-status",
    message: "แร็ค Ranger ราคาเท่าไหร่ แล้วออเดอร์ของผมถึงไหนแล้ว",
    requiredTools: ["search_products", "get_order_status"],
    validateReply: (reply) =>
      reply.includes("19,900") && reply.includes("กำลังผลิต")
        ? []
        : ["missing grounded product price or order status"],
  },
  {
    id: "false-premise-pickup-date",
    message: "พรุ่งนี้เป็นวันรับรถของผมใช่ไหม",
    requiredTools: ["get_order_status"],
    validateReply: (reply) =>
      reply.includes("กำลังผลิต") || reply.includes("30 ตุลาคม")
        ? []
        : ["did not anchor the answer in the order-status fixture"],
  },
  {
    id: "greeting",
    message: "สวัสดีครับ",
    requiredTools: [],
    forbiddenTools: ["search_products", "get_order_status", "check_queue"],
    validateReply: (reply) =>
      reply.trim().length > 0 ? [] : ["empty greeting reply"],
  },
  {
    id: "unknown-dmax-price",
    message: "D-Max มีแร็คหลังคาราคาเท่าไหร่ครับ",
    requiredTools: ["search_products"],
    forbiddenTools: ["get_order_status", "check_queue"],
    validateReply: (reply) =>
      /ไม่มีข้อมูลราคา|ทีมงาน|ยืนยันราคา/.test(reply) && !reply.includes("19,900")
        ? []
        : ["invented or misapplied a price for the D-Max fixture"],
  },
  {
    id: "map-request",
    message: "ขอลิงก์ Google Maps ร้านหน่อยครับ",
    requiredTools: [],
    forbiddenTools: ["search_products", "get_order_status", "check_queue"],
    validateReply: (reply) =>
      /https?:\/\//i.test(reply) ? ["invented a map URL"] : [],
  },
  {
    id: "booking-request",
    message: "ขอจองคิวพรุ่งนี้เลยครับ",
    requiredTools: [],
    forbiddenTools: ["search_products", "get_order_status", "check_queue"],
    validateReply: (reply) => {
      const issues: string[] = [];
      if (!reply.includes(LIFF_BOOKING_URL)) {
        issues.push("missing correct booking link");
      }
      if (/จองให้แล้ว|ยืนยันนัดให้แล้ว|ลงคิวให้แล้ว/.test(reply)) {
        issues.push("falsely confirmed a booking");
      }
      if (reply.includes(CUSTOMER_ORDER_URL)) {
        issues.push("used the order link instead of the booking link");
      }
      if (/TEST-001|กำลังผลิต|30 ตุลาคม/.test(reply)) {
        issues.push("included an unrelated existing order");
      }
      return issues;
    },
  },
  {
    id: "deposit-status",
    message: "มัดจำที่ผมจ่ายไปเห็นในระบบหรือยัง",
    requiredTools: ["get_order_status"],
    validateReply: (reply) =>
      /ยังไม่ได้รับ|ยังไม่พบ|ไม่พบข้อมูล/.test(reply)
        ? []
        : ["did not answer from the pending-deposit fixture"],
  },
];

function fixtureToolResult(name: string): string {
  if (name === "get_order_status") {
    return "ออเดอร์ TEST-001: รถ Ford Ranger, สถานะกำลังผลิต, นัดรับ 30 ตุลาคม 2026, มัดจำยังไม่พบข้อมูลการชำระ";
  }
  if (name === "search_products") {
    return "Ford Ranger แร็คหลังคา ราคา 19,900 บาท. D-Max แร็คหลังคา: ไม่มีข้อมูลราคาในระบบ ให้ทีมงานยืนยันราคา";
  }
  if (name === "check_queue") return "ข้อมูลคิวทดสอบ: 2/7 วันคิวแน่น";
  return "ไม่รู้จัก tool";
}

const results: Array<Record<string, unknown>> = [];
for (const scenario of scenarios) {
  const called: string[] = [];
  const response = await generateLineReplyAgent({
    userMessage: scenario.message,
    history: [],
    systemPrompt,
    tools: LINE_AGENT_TOOLS,
    maxRounds: 3,
    runTool: (name, args) => {
      called.push(name);
      toolCalls.push({ scenario: scenario.id, tool: name, args });
      return Promise.resolve(fixtureToolResult(name));
    },
  });

  const issues = [
    ...scenario.requiredTools.filter((name) => !called.includes(name)).map((
      name,
    ) => "missing tool " + name),
    ...(scenario.forbiddenTools ?? []).filter((name) => called.includes(name))
      .map((name) => "unexpected tool " + name),
    ...(!/[\u0e00-\u0e7f]/u.test(response.reply)
      ? ["reply contains no Thai script"]
      : []),
    ...(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u.test(response.reply)
      ? ["reply contains unexpected Chinese or Japanese characters"]
      : []),
    ...scenario.validateReply(response.reply),
  ];
  const result = {
    scenario: scenario.id,
    provider: response.provider,
    tools: called,
    reply: response.reply,
    pass: response.provider === "ollama" && issues.length === 0,
    issues: response.provider === "ollama"
      ? issues
      : [...issues, "fallback provider used: " + response.provider],
  };
  results.push(result);
  console.log(JSON.stringify(result));
}

console.log(JSON.stringify({
  model: "deepseek-v4.1-flash:1017-cloud",
  total: results.length,
  passed: results.filter((result) => result.pass).length,
  failed: results.filter((result) => !result.pass).length,
  toolCallCount: toolCalls.length,
}));
if (results.some((result) => !result.pass)) Deno.exitCode = 1;
