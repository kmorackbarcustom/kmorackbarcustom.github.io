import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { guardGroundedOutput } from "./output-grounding.ts";

const orderEvidence = [
  [
    "ข้อมูล authoritative",
    "- ออเดอร์ ORD-20260824-42EF",
    "  ชื่อลูกค้า: Sumo",
    "  รถ: Suzuki V Strom 800 de",
    "  สถานะ: รอดำเนินการ",
  ].join("\n"),
];

Deno.test("blocks Sumo as vehicle when only customer_name is Sumo", () => {
  const result = guardGroundedOutput("รถรุ่น SUMO", {
    userMessage: "Sumo",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("SUMO"), false);
});

Deno.test("allows authoritative vehicle from DB tool result", () => {
  const draft = "รถ Suzuki V Strom 800 de";
  const result = guardGroundedOutput(draft, {
    userMessage: "รถผมเป็นรุ่นอะไรครับ",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result, { text: draft, blocked: false });
});
Deno.test("allows vehicle explicitly labeled by customer in current turn", () => {
  const result = guardGroundedOutput("รถรุ่น PCX", {
    userMessage: "รถผมรุ่น PCX ครับ",
  });
  assertEquals(result, { text: "รถรุ่น PCX", blocked: false });
});

Deno.test("blocks ambiguous proper noun from becoming vehicle", () => {
  const result = guardGroundedOutput("รถรุ่น PCX", {
    userMessage: "PCX",
  });
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("PCX"), false);
});

Deno.test("blocks invented vehicle when DB vehicle is missing", () => {
  const result = guardGroundedOutput("รถรุ่น ADV350", {
    userMessage: "เช็คให้หน่อยครับ",
    authoritativeToolResults: ["ชื่อลูกค้า: Sumo\nรถ: ไม่มีข้อมูลในระบบ"],
  });
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("ADV350"), false);
});

Deno.test("structured reschedule summary survives guard", () => {
  const draft = "รับข้อมูลแล้วครับ จากวันเสาร์ เลื่อนเป็นวันจันทร์";
  const result = guardGroundedOutput(draft, {
    userMessage: "วันเสาร์ เลื่อนเป็นวันจันทร์",
    structuredDates: { original_date: "วันเสาร์", requested_date: "วันจันทร์" },
  });
  assertEquals(result, { text: draft, blocked: false });
});
Deno.test("general vehicle wording is not a factual identity claim", () => {
  const draft = "ทางร้านรับทำอุปกรณ์สำหรับรถหลายรุ่นครับ";
  const result = guardGroundedOutput(draft, {
    userMessage: "รับทำรถรุ่นอะไรบ้างครับ",
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("removes unsupported vehicle line but preserves other safe lines", () => {
  const result = guardGroundedOutput(
    "รับทราบครับ\nรถรุ่น SUMO\nจากวันเสาร์เลื่อนเป็นวันจันทร์",
    {
      userMessage: "Sumo\nวันเสาร์ เลื่อนเป็น\nวันจันทร์ ครับ",
      authoritativeToolResults: orderEvidence,
    },
  );
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("SUMO"), false);
  assertStringIncludes(result.text, "วันเสาร์เลื่อนเป็นวันจันทร์");
});

Deno.test("blocks unsupported direct customer name", () => {
  const result = guardGroundedOutput("รับทราบครับคุณ Sumo", {
    userMessage: "Sumo",
  });
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("Sumo"), false);
});

Deno.test("allows authoritative direct customer name", () => {
  const draft = "รับทราบครับคุณ Sumo";
  const result = guardGroundedOutput(draft, {
    userMessage: "เช็คให้หน่อยครับ",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("allows customer name explicitly labeled in current turn", () => {
  const draft = "รับทราบครับคุณ Sumo";
  const result = guardGroundedOutput(draft, {
    userMessage: "ผมชื่อ Sumo ครับ",
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("blocks unsupported order status claim", () => {
  const result = guardGroundedOutput("งานเสร็จแล้วครับ", {
    userMessage: "งานเป็นยังไงบ้างครับ",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result.blocked, true);
  assertEquals(result.text.includes("เสร็จแล้ว"), false);
});

Deno.test("allows order status supported by authoritative result", () => {
  const draft = "งานรอดำเนินการครับ";
  const result = guardGroundedOutput(draft, {
    userMessage: "งานเป็นยังไงบ้างครับ",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("blocks unsupported factual due date", () => {
  const result = guardGroundedOutput("กำหนดส่งวันที่ 30/8/2026", {
    userMessage: "ส่งวันไหนครับ",
    authoritativeToolResults: orderEvidence,
  });
  assertEquals(result.blocked, true);
});

Deno.test("allows factual due date supported by authoritative result", () => {
  const draft = "กำหนดส่งวันที่ 30/8/2026";
  const result = guardGroundedOutput(draft, {
    userMessage: "ส่งวันไหนครับ",
    authoritativeToolResults: ["สถานะ: กำลังผลิต\nกำหนดส่ง: 30/8/2026"],
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("allows production canonical done status to support Thai completed wording", () => {
  const draft = "งานเสร็จแล้วครับ";
  const result = guardGroundedOutput(draft, {
    userMessage: "งานเสร็จหรือยังครับ",
    authoritativeToolResults: ["สถานะ: done\nกำหนดส่ง: 2026-08-31"],
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("allows human-formatted Thai date equivalent to ISO authoritative date", () => {
  const draft = "กำหนดส่งวันที่ 31 ส.ค. 2569";
  const result = guardGroundedOutput(draft, {
    userMessage: "กำหนดส่งวันไหนครับ",
    authoritativeToolResults: ["สถานะ: done\nกำหนดส่ง: 2026-08-31"],
  });
  assertEquals(result, { text: draft, blocked: false });
});

Deno.test("blocks same day and month when claimed Buddhist year is wrong", () => {
  const result = guardGroundedOutput("กำหนดส่งวันที่ 31 ส.ค. 2570", {
    userMessage: "กำหนดส่งวันไหนครับ",
    authoritativeToolResults: ["สถานะ: done\nกำหนดส่ง: 2026-08-31"],
  });
  assertEquals(result.blocked, true);
  assertEquals(result.reason, "unsupported_order_date_claim");
});
