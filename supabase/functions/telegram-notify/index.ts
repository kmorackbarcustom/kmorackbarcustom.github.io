import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;

async function sendTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Telegram error:", body);
  }
}

function formatBooking(r: Record<string, unknown>): string {
  return [
    `📅 <b>จองคิวใหม่!</b>`,
    `🔖 Job ID: <code>${r.job_id ?? "-"}</code>`,
    `👤 ชื่อ: ${r.customer_name ?? "-"}`,
    `📞 เบอร์: ${r.phone ?? "-"}`,
    `🏍️ รถ: ${r.brand ?? ""} ${r.model ?? ""}`.trim(),
    `🔧 งาน: ${r.product ?? "-"}`,
    `🎨 สี: ${r.color ?? "-"}`,
    `📌 วันรับรถ: ${r.appointment_date ?? "-"}`,
    `📦 วันรับคืน: ${r.pickup_date ?? "-"}`,
    `📢 ช่องทาง: ${r.source ?? "-"}`,
  ].join("\n");
}

function formatThaiDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    month: "short",
  }).format(date);
  const year = String(date.getUTCFullYear() + 543).slice(-2);
  return `${day} ${month} ${year}`;
}

function paymentLabel(value: unknown): string {
  if (value === "deposit500") return "มัดจำ 500 บาท";
  if (value === "deposit1000") return "มัดจำ 1,000 บาท";
  if (value === "full") return "เต็มจำนวน";
  return String(value ?? "-");
}

function deliveryLabel(value: unknown): string {
  if (value === "pickup") return "ติดตั้งที่ร้าน";
  if (value === "delivery") return "จัดส่ง";
  return String(value ?? "-");
}

function formatOrder(r: Record<string, unknown>): string {
  const items = Array.isArray(r.items)
    ? (r.items as string[]).join(", ")
    : String(r.items ?? "-");

  const lines = [
    `🛒 <b>ออเดอร์สั่งผลิตใหม่!</b>`,
    `🔖 Order ID: <code>${r.order_id ?? "-"}</code>`,
    `👤 ชื่อ: ${r.customer_name ?? "-"}`,
    `📞 ติดต่อ: ${r.contact ?? "-"}`,
    `🏍️ รถ: ${r.brand ?? ""} ${r.model ?? ""}`.trim(),
    `🔧 รายการ: ${items}`,
    `🎨 สี: ${r.color ?? "-"}`,
    `📦 จำนวนงาน: ${r.unit ?? "-"} ยูนิต`,
    `💳 ชำระ: ${paymentLabel(r.payment_type)}`,
    `🚚 รับของ: ${deliveryLabel(r.delivery_type)}`,
    `📅 เริ่มผลิต: ${formatThaiDate(r.start_date)}`,
    `🎯 กำหนดส่ง: ${formatThaiDate(r.due_date)}`,
  ];
  if (r.delivery_address) lines.push(`📍 ที่อยู่: ${r.delivery_address}`);
  if (r.channel) lines.push(`📢 ช่องทาง: ${r.channel}`);
  return lines.join("\n");
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const { table, record, type } = payload as {
      table: string;
      record: Record<string, unknown>;
      type: string;
    };

    if (type !== "INSERT") {
      return new Response("skip", { status: 200 });
    }

    let message: string;
    if (table === "bookings") {
      message = formatBooking(record);
    } else if (table === "orders") {
      message = formatOrder(record);
    } else {
      return new Response("unknown table", { status: 200 });
    }

    await sendTelegram(message);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-notify error:", err);
    return new Response("error", { status: 500 });
  }
});
