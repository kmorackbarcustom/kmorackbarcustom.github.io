import { createServiceClient } from "./database.ts";
import { getCustomerContext } from "./customer-context.ts";
import {
  CUSTOMER_ORDER_URL,
  dateOnlyInBangkok,
  LIFF_BOOKING_URL,
} from "./constants.ts";
import type { ToolDef, ToolRunner } from "./ai-providers.ts";

type MatchedProduct = {
  brand: string | null;
  model: string | null;
  name: string;
  price: number;
  category: string;
  allow_booking: boolean;
  allow_order: boolean;
};
type QueueDay = { work_date: string; units: number; is_over_capacity: boolean };

function formatProducts(products: MatchedProduct[]): string {
  if (products.length === 0) {
    return "ไม่พบสินค้าที่ตรงกับคำค้นนี้ในระบบ ถ้าลูกค้าถามจะจอง/สั่งยังไง ให้ถามกลับว่าหมายถึงรุ่นรถ/สินค้าอะไร ห้ามเดาลิงก์เอง";
  }
  const line = (p: MatchedProduct) =>
    `- ${
      [p.brand, p.model].filter(Boolean).join(" ")
    } ${p.name} (${p.category}): ${p.price.toLocaleString("th-TH")} บาท`;
  const groups: string[] = [];
  const bookingOnly = products.filter((p) => p.allow_booking && !p.allow_order);
  const orderOnly = products.filter((p) => p.allow_order && !p.allow_booking);
  const either = products.filter((p) => p.allow_booking && p.allow_order);
  if (bookingOnly.length) {
    groups.push(
      [
        `กลุ่ม "ต้องเอารถเข้าร้าน" (ลิงก์: ${LIFF_BOOKING_URL}):`,
        ...bookingOnly.map(line),
      ].join("\n"),
    );
  }
  if (orderOnly.length) {
    groups.push(
      [
        `กลุ่ม "สั่งผลิตได้เลยไม่ต้องเข้าร้าน" (ลิงก์: ${CUSTOMER_ORDER_URL}):`,
        ...orderOnly.map(line),
      ].join("\n"),
    );
  }
  if (either.length) {
    groups.push(['กลุ่ม "จองคิวหรือสั่งผลิตก็ได้":', ...either.map(line)].join("\n"));
  }
  return [
    "ราคาจากรายการนี้เท่านั้น ห้ามเดาราคาสินค้าที่ไม่อยู่ในนี้ ถ้าสินค้าอยู่คนละกลุ่มต้องให้ลิงก์ของแต่ละกลุ่มแยกกัน:",
    ...groups,
  ].join("\n\n");
}

function formatQueueDensity(queueDays: QueueDay[]): string {
  if (queueDays.length === 0) return "ไม่มีข้อมูลคิวช่วงนี้";
  const overCount = queueDays.filter((d) => d.is_over_capacity).length;
  const lines = queueDays.map((d) => {
    const label = new Date(`${d.work_date}T00:00:00`).toLocaleDateString(
      "th-TH",
      { day: "numeric", month: "short" },
    );
    return `- ${label}: ${
      d.is_over_capacity ? "งานเกินกำลังผลิตปกติ (คิวแน่น)" : "ยังไม่เกินกำลังผลิตปกติ"
    }`;
  });
  return [
    `สถานะคิว ${queueDays.length} วันข้างหน้า:`,
    ...lines,
    `สรุป: ${overCount}/${queueDays.length} วันคิวแน่น`,
  ].join("\n");
}

export const LINE_AGENT_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "ค้นหาสินค้าและราคาในระบบร้าน (แร็คหลังคา, กันชน, บันได ฯลฯ) เรียกเมื่อลูกค้าถามราคา/รุ่น/มีของไหม ใส่ query เป็นชื่อรุ่นรถหรือชื่อสินค้าที่ลูกค้าพูดถึง",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "คำค้น เช่น 'แร็คหลังคา Ford Ranger' หรือ 'กันชนหน้า Hilux'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description:
        "ตรวจ order/booking ของ LINE user ปัจจุบัน และใช้ผลจาก tool นี้เป็น authoritative source สำหรับชื่อลูกค้า รถ/รุ่น รายการงาน สถานะ วันกำหนดส่ง/วันนัด และสถานะมัดจำ/การชำระเงิน เมื่อกำลังจะกล่าวถึงข้อมูลเหล่านี้ต้องเรียก tool นี้ใน turn ปัจจุบันก่อน โดยเฉพาะเรื่องมัดจำ/ชำระเงินห้ามใช้ความจำจากประวัติแชท ระบบรู้ตัวตนจาก LINE อยู่แล้ว ไม่ต้องมี phone ก็เรียกได้ ใส่ phone เฉพาะตอนที่ลูกค้าพิมพ์เบอร์มาในแชท",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "เบอร์โทรลูกค้าถ้าพิมพ์มาในแชท (10 หลัก)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_queue",
      description:
        "ดูว่าคิวงานผลิตช่วง 7 วันข้างหน้าแน่นแค่ไหน เรียกเมื่อลูกค้าถามว่าตอนนี้คิวยาวไหม/รับงานเพิ่มได้ไหม/สั่งตอนนี้เสร็จเมื่อไหร่",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// Bind the tools to one customer's request. Returns a runner the agent loop calls per tool_call.
export function makeLineAgentRunner(
  supabase: ReturnType<typeof createServiceClient>,
  lineUid: string,
): ToolRunner {
  return async (name, args) => {
    switch (name) {
      case "search_products": {
        const query = String(args.query ?? "").trim();
        if (!query) return "ไม่ได้ระบุคำค้น";
        const { data, error } = await supabase.rpc("search_products", {
          customer_message: query,
        });
        if (error) {
          console.error("[line-agent] search_products failed", error);
          return "ค้นหาสินค้าไม่สำเร็จ";
        }
        return formatProducts((data ?? []) as MatchedProduct[]);
      }
      case "get_order_status": {
        const phone = typeof args.phone === "string"
          ? args.phone.replace(/[-\s]/g, "").match(/0\d{8,9}/)?.[0] ?? null
          : null;
        return await getCustomerContext(supabase, lineUid, phone);
      }
      case "check_queue": {
        const { data, error } = await supabase.rpc(
          "get_upcoming_queue_density",
          { from_date: dateOnlyInBangkok(), days: 7 },
        );
        if (error) {
          console.error("[line-agent] check_queue failed", error);
          return "ดูสถานะคิวไม่สำเร็จ";
        }
        return formatQueueDensity((data ?? []) as QueueDay[]);
      }
      default:
        return `ไม่รู้จัก tool: ${name}`;
    }
  };
}
