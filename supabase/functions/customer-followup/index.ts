import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const TIME_ZONE = "Asia/Bangkok";

// สถานะที่ "จบแบบไม่ต้องติดตาม" (ยกเลิก/ไม่มา) — งานเสร็จยังต้องติดตาม (ทวงรับรถ)
const TERMINAL_NEGATIVE = ["ยกเลิก", "cancel", "no_show", "ยังไม่มา", "ไม่มาตามนัด"];
const DONE_KEYWORDS = ["เสร็จ", "done", "completed", "ส่งมอบ", "delivered"];

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isTerminalNegative(status: unknown): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return TERMINAL_NEGATIVE.some((k) => normalized.includes(k.toLowerCase()));
}

function isDone(status: unknown): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return DONE_KEYWORDS.some((k) => normalized.includes(k.toLowerCase()));
}

function dateOnlyInBangkok(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnlyInBangkok(date);
}

function diffDays(fromDate: string, toDate = dateOnlyInBangkok()): number {
  const from = new Date(`${fromDate}T00:00:00+07:00`).getTime();
  const to = new Date(`${toDate}T00:00:00+07:00`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

function bangkokHour(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hour: "2-digit", hour12: false,
  }).format(date));
}

function formatDateThai(dateString: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE, year: "numeric", month: "short", day: "numeric",
  }).format(new Date(`${dateString}T00:00:00+07:00`));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "-")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatItems(items: unknown): string {
  if (!items) return "-";
  if (Array.isArray(items)) {
    return items.map((i) => {
      if (typeof i === "string") return i;
      if (i && typeof i === "object") {
        const v = i as Record<string, unknown>;
        return v.name ?? v.product ?? v.title ?? JSON.stringify(i);
      }
      return String(i);
    }).join(" / ");
  }
  if (typeof items === "string") {
    try { return formatItems(JSON.parse(items)); } catch { return items; }
  }
  return JSON.stringify(items);
}

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${requiredEnv("TELEGRAM_BOT_TOKEN")}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      },
    );
    const json = await res.json();
    return res.ok && json.ok !== false;
  } catch (err) {
    console.error("[customer-followup] telegram send failed", err);
    return false;
  }
}

// ส่ง LINE push ตรงๆ (เหมือน appointment-reminder ที่ใช้ LINE_CHANNEL_ACCESS_TOKEN)
async function pushLineMessage(to: string, text: string): Promise<boolean> {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    console.error("[customer-followup] LINE_CHANNEL_ACCESS_TOKEN not set");
    return false;
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[customer-followup] LINE push failed (${res.status})`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[customer-followup] LINE push error", err);
    return false;
  }
}

serve(async (req) => {
  const fn = "customer-followup";
  console.log(`[${fn}] Starting...`);

  try {
    const url = new URL(req.url);
    const forced = req.headers.get("x-kmo-force") === "true" || url.searchParams.get("force") === "true";

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: settingsRows, error: settingsError } = await supabase.from("system_settings").select("key,value");
    if (settingsError) throw settingsError;
    const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));

    // Gate 1: feature flag (default off -> ปลอดภัย production)
    if (settings.customer_followup_enabled !== "true") {
      return jsonResponse({ skipped: true, reason: "customer_followup_enabled is not true" });
    }

    // Gate 2: schedule hour (มี force ข้ามได้)
    if (!forced) {
      const expectedHour = Number(settings.customer_followup_hour ?? 10);
      const currentHour = bangkokHour();
      if (currentHour !== expectedHour) {
        return jsonResponse({ skipped: true, reason: `outside_schedule_window_${expectedHour}`, current_bangkok_hour: currentHour });
      }
    }

    const chatId = settings.telegram_group_chat_id;
    const today = dateOnlyInBangkok();
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);

    // ---- Bookings: ลูกค้าที่ผูก LINE แล้ว ----------------
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id,job_id,customer_name,phone,brand,model,product,color,appointment_date,pickup_date,production_status,line_uid")
      .not("line_uid", "is", null)
      .neq("line_uid", "")
      .limit(500);
    if (bookingsError) throw bookingsError;

    let bookingNotified = 0;
    let bookingSkipped = 0;

    for (const b of (bookings ?? [])) {
      // ยกเลิก/ไม่มา = จบ ไม่ต้องติดตาม แต่ งานเสร็จ ยังต้องติดตาม (ทวงรับรถ)
      if (isTerminalNegative(b.production_status)) continue;

      let notifyType: string | null = null;
      let lineMsg = "";
      let staffMsg = "";

      if (b.pickup_date === today) {
        notifyType = "customer_pickup_today";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `วันนี้เป็นวันนัดรับรถของคุณครับ 🏍️`,
          `งาน: ${b.job_id}`,
          `รถ: ${b.brand} ${b.model}`,
          "มารับได้เลย หรือถ้าติดธุระรบกวนแจ้งร้านล่วงหน้าครับ",
        ].join("\n");
        staffMsg = `📢 <b>นัดรับรถวันนี้!</b> ${b.job_id} — ${escapeHtml(b.customer_name)} (${escapeHtml(b.phone)}) — LINE แจ้งลูกค้าแล้ว`;
      } else if (b.pickup_date === tomorrow) {
        notifyType = "customer_pickup_tomorrow";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `พรุ่งนี้เป็นวันนัดรับรถของคุณครับ (${formatDateThai(b.pickup_date)})`,
          `งาน: ${b.job_id}`,
          `รถ: ${b.brand} ${b.model}`,
          "ถ้าต้องเลื่อนนัด รบกวนทัก LINE หรือโทรแจ้งร้านล่วงหน้าครับ",
        ].join("\n");
        staffMsg = `📢 <b>นัดรับรถพรุ่งนี้</b> ${b.job_id} — ${escapeHtml(b.customer_name)} — LINE แจ้งลูกค้าแล้ว`;
      } else if (isDone(b.production_status) && b.pickup_date && b.pickup_date < today) {
        notifyType = "customer_ready_unpicked";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `งานของคุณเสร็จเรียบร้อยแล้วครับ ✅`,
          `งาน: ${b.job_id}`,
          `รถ: ${b.brand} ${b.model}`,
          `นัดรับเดิม: ${formatDateThai(b.pickup_date)}`,
          "สะดวกมารับได้เลยครับ",
        ].join("\n");
        staffMsg = `⚠️ <b>งานเสร็จแต่ยังไม่มารับ</b> ${b.job_id} — ${escapeHtml(b.customer_name)} — LINE ทวงลูกค้าแล้ว`;
      } else if (b.appointment_date && b.appointment_date < yesterday && String(b.production_status ?? "") === "รอเริ่มงาน") {
        notifyType = "customer_no_show";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `ยังไม่เห็นรถของคุณเข้าร้านตามนัด (${formatDateThai(b.appointment_date)}) ครับ`,
          `งาน: ${b.job_id}`,
          "สะดวกเมื่อไหร่ แจ้งร้านได้เลยเพื่อจัดคิวใหม่ครับ",
        ].join("\n");
        staffMsg = `⚠️ <b>ลูกค้าไม่มาตามนัด</b> ${b.job_id} — ${escapeHtml(b.customer_name)} (${escapeHtml(b.phone)}) — LINE ทวงลูกค้าแล้ว`;
      }

      if (!notifyType) { bookingSkipped += 1; continue; }

      // Dedupe: วันนี้เคยส่งให้ booking นี้แล้วไหม
      const { data: dup } = await supabase
        .from("notifications_log")
        .select("id")
        .eq("booking_id", b.id)
        .eq("notification_type", notifyType)
        .gte("sent_at", `${today}T00:00:00+07:00`);
      if (dup && dup.length > 0) { bookingSkipped += 1; continue; }

      const lineOk = await pushLineMessage(b.line_uid, lineMsg);

      await supabase.from("notifications_log").insert({
        booking_id: b.id,
        notification_type: notifyType,
        message: lineMsg,
        sent_to: b.line_uid,
        success: lineOk,
        error_message: lineOk ? null : "line push failed",
      });

      if (lineOk && chatId) {
        await sendTelegramMessage(chatId, staffMsg);
      }
      if (lineOk) bookingNotified += 1;
    }

    // ---- Orders: ลูกค้าที่ผูก LINE แล้ว ----------------
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,order_id,customer_name,brand,model,items,color,due_date,status,line_user_id")
      .not("line_user_id", "is", null)
      .neq("line_user_id", "")
      .limit(500);
    if (ordersError) throw ordersError;

    let orderNotified = 0;
    let orderSkipped = 0;

    for (const o of (orders ?? [])) {
      if (isTerminalNegative(o.status)) continue;
      if (!o.due_date) continue;

      const delta = diffDays(o.due_date);
      let notifyType: string | null = null;
      let lineMsg = "";
      let staffMsg = "";

      if (delta === 1) {
        notifyType = "customer_order_due_tomorrow";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `ออเดอร์ของคุณถึงกำหนดส่งพรุ่งนี้ครับ (${formatDateThai(o.due_date)})`,
          `ออเดอร์: ${o.order_id}`,
          `รายการ: ${formatItems(o.items)}`,
          "ทีมงานจะติดต่อเรื่องการรับสินค้าครับ",
        ].join("\n");
        staffMsg = `📢 <b>ออเดอร์กำหนดส่งพรุ่งนี้</b> ${escapeHtml(o.order_id)} — ${escapeHtml(o.customer_name)} — LINE แจ้งลูกค้าแล้ว`;
      } else if (delta === 0) {
        notifyType = "customer_order_due_today";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `วันนี้เป็นกำหนดส่งออเดอร์ของคุณครับ 📦`,
          `ออเดอร์: ${o.order_id}`,
          "ทีมงานจะติดต่อเรื่องการรับสินค้าครับ",
        ].join("\n");
        staffMsg = `📢 <b>ออเดอร์กำหนดส่งวันนี้</b> ${escapeHtml(o.order_id)} — ${escapeHtml(o.customer_name)} — LINE แจ้งลูกค้าแล้ว`;
      } else if (delta < 0) {
        notifyType = "customer_order_overdue";
        lineMsg = [
          "แจ้งเตือนจาก KMO Rack Bar Custom",
          `ออเดอร์ของคุณเลยกำหนดส่งแล้ว (เดิม ${formatDateThai(o.due_date)})`,
          `ออเดอร์: ${o.order_id}`,
          "ขออภัยในความล่าช้า ทีมงานจะติดต่อกลับโดยเร็วครับ",
        ].join("\n");
        staffMsg = `🔴 <b>ออเดอร์เลยกำหนดส่ง</b> ${escapeHtml(o.order_id)} — ${escapeHtml(o.customer_name)} — LINE แจ้งลูกค้าแล้ว`;
      }

      if (!notifyType) { orderSkipped += 1; continue; }

      // Dedupe: วันนี้เคยส่งให้ order นี้แล้วไหม (sent_to เก็บ order uuid)
      const { data: dup } = await supabase
        .from("notifications_log")
        .select("id")
        .eq("notification_type", notifyType)
        .eq("sent_to", String(o.id))
        .gte("sent_at", `${today}T00:00:00+07:00`);
      if (dup && dup.length > 0) { orderSkipped += 1; continue; }

      const lineOk = await pushLineMessage(o.line_user_id, lineMsg);

      await supabase.from("notifications_log").insert({
        notification_type: notifyType,
        message: lineMsg,
        sent_to: String(o.id),
        success: lineOk,
        error_message: lineOk ? null : "line push failed",
      });

      if (lineOk && chatId) {
        await sendTelegramMessage(chatId, staffMsg);
      }
      if (lineOk) orderNotified += 1;
    }

    console.log(`[${fn}] Done`, { bookingNotified, bookingSkipped, orderNotified, orderSkipped });
    return jsonResponse({ booking_notified: bookingNotified, booking_skipped: bookingSkipped, order_notified: orderNotified, order_skipped: orderSkipped });
  } catch (error) {
    console.error(`[${fn}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
