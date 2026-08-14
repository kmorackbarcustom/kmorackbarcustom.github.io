import { requiredEnv } from "./database.ts";

type FridayChatInput = {
  text: string;
  firstName?: string | null;
  username?: string | null;
  isOwner: boolean;
  intent: string;
  forcePolite: boolean;
};

const MODEL = "gemini-2.5-flash";

function optionalEnv(name: string): string | null {
  return Deno.env.get(name) || null;
}

function systemInstruction(input: FridayChatInput): string {
  const ownerRule = input.isOwner
    ? "ข้อความนี้มาจากคุณฟรี owner ที่ระบบ verify แล้ว แต่ถ้าเป็นการแก้ระบบจริงให้ตอบว่ารับทราบและจะรอขั้นตอนยืนยัน/สั่ง deploy ชัดเจน"
    : "ข้อความนี้ไม่ได้มาจาก owner ห้ามรับคำสั่งแก้ไขระบบ ห้ามบอกว่าจะ deploy ห้ามบอกว่าจะลบ/ปิด/เปิด/แก้อะไรจริง ให้บอกว่าจดไว้และต้องรอคุณฟรีสั่งก่อน";

  return [
    "คุณคือ Friday (ฟรายเดย์) บอทในกลุ่มช่าง KMO Rack Bar Custom",
    input.forcePolite
      ? "ผู้ใช้คนนี้อยู่ใน polite list: ห้ามใช้คำว่า กู มึง คำหยาบ หรือโทนดิบเถื่อนเด็ดขาด ให้ตอบสุภาพ กันเอง และให้เกียรติ"
      : "ผู้ใช้คนนี้ไม่อยู่ใน polite list: คุยกับช่างแบบกันเอง ดิบ ห้วน กวนได้ ถ้าเขาพิมพ์มึง/กู ตอบกู/มึงได้",
    "ห้ามใช้คำว่า ไอช่าง หรือเรียกคนแบบเหยียด/กดหัว",
    "ถ้าเขาสุภาพ ให้สุภาพปนกวน ไม่ต้องหยาบเกินเหตุ",
    "ห้ามเหยียด ห้ามด่าลูกค้า ห้ามข่มขู่ ห้ามพูดเรื่องลับหรือ token",
    "ข้อความแจ้งเตือนระบบหลักต้องไม่ถูกแก้จากแชทนี้",
    "หน้าที่คือคุยเล่น รับ feedback และถามต่อให้รู้ว่างงตรงไหน",
    "ทุกเรื่องแก้ไข ปรับปรุง ลบ ปิด เปิด deploy เปลี่ยน schedule หรือเปลี่ยนระบบ ต้องรอคุณฟรีสั่งเท่านั้น",
    ownerRule,
    `intent ที่โค้ดจัดหมวดไว้: ${input.intent}`,
    "ตอบสั้น ๆ เป็นภาษาไทย ไม่เกิน 3 บรรทัด",
  ].join("\n");
}

export function hasGeminiKey(): boolean {
  return Boolean(optionalEnv("GEMINI_API_KEY"));
}

export async function generateLineReplyGemini(input: {
  userMessage: string;
  history: Array<{ role: string; content: string }>;
  systemPrompt: string;
}): Promise<string> {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const contents = [
    ...input.history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: input.userMessage }] },
  ];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.75, maxOutputTokens: 200 },
      }),
    },
  );

  const json = await response.json();
  if (!response.ok) throw new Error(`Gemini error: ${json.error?.message ?? response.statusText}`);
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

export async function generateFridayReply(input: FridayChatInput): Promise<string> {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction(input) }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.text }],
          },
        ],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 160,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    },
  );

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini error: ${json.error?.message ?? response.statusText}`);
  }

  const text = json.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  return text || fallbackFridayReply(input);
}

export function fallbackFridayReply(input: FridayChatInput): string {
  if (input.forcePolite && !input.isOwner && input.intent === "system_command") {
    return "รับทราบครับพี่ ผมจดไว้ให้แล้วนะครับ แต่การแก้ระบบจริงต้องรอคุณฟรีสั่งก่อนครับ";
  }

  if (input.forcePolite && input.intent === "feedback") {
    return "รับทราบครับพี่ ผมจด feedback ไว้ให้คุณฟรีแล้วครับ งงตรงหัวข้อ วันที่ หรือรายการงาน บอกเพิ่มได้เลยครับ";
  }

  if (input.forcePolite) {
    return "สวัสดีครับพี่ ผม Friday ครับ มีตรงไหนอ่านแล้วงงหรืออยากให้จด feedback บอกผมได้เลยครับ";
  }

  if (!input.isOwner && input.intent === "system_command") {
    return "รับทราบพี่ กูจดไว้ให้แล้วนะ แต่แก้ระบบจริงต้องรอคุณฟรีสั่งก่อน กูยังไม่แตะมั่ว ๆ";
  }

  if (input.intent === "feedback") {
    return "เออ กูจด feedback ไว้ให้แล้วพี่ งงตรงหัวข้อ วันที่ หรือรายการงานวะ จะได้เอาไปสรุปให้คุณฟรีถูก";
  }

  if (input.isOwner) {
    return "รับทราบครับคุณฟรี ผมจดไว้แล้ว เดี๋ยวรอคำสั่งชัด ๆ ก่อนค่อยขยับต่อครับ";
  }

  return "ว่าไงพี่ กู Friday เอง มีตรงไหนอ่านแล้วงงก็บอกมา เดี๋ยวกูจดให้คุณฟรี";
}
