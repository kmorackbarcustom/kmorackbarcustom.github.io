import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CALLBACK_STATUS_MAP, addDays, dateOnlyInBangkok, diffDays, isStopStatus, TIME_ZONE } from "../_shared/constants.ts";
import { createServiceClient, getSettings, jsonResponse } from "../_shared/database.ts";
import { SupabaseAuditStore } from "../_shared/audit-log-store.ts";
import { escapeHtml, formatDateThai, formatDateTimeThai, formatItems } from "../_shared/formatters.ts";
import { fallbackFridayReply, generateFridayReply, hasGeminiKey } from "../_shared/gemini.ts";
import { answerCallbackQuery, editMessageReplyMarkup, sendTelegramMessage } from "../_shared/telegram.ts";
import { createAuditLog } from "../_shared/vendor/audit-log/core/index.ts";

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type?: string; title?: string };
    from?: {
      id?: number;
      is_bot?: boolean;
      first_name?: string;
      username?: string;
    };
    reply_to_message?: {
      from?: {
        is_bot?: boolean;
        username?: string;
      };
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { first_name?: string; username?: string };
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
};

type FridayIntent = "feedback" | "system_command" | "data_query" | "chat";
type DataQueryType =
  | "today_bookings"
  | "overdue_orders"
  | "overdue_work"
  | "today_due_orders"
  | "booking_window"
  | "order_window"
  | "nearest_available";

type ParsedDataQuery = {
  type: DataQueryType;
  targetDate: string;
  windowDays: number;
  label: string;
};

type BookingInfo = {
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  product: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  production_status: string | null;
};

type OrderInfo = {
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  due_date: string | null;
  status: string | null;
};

const FUTURE_LOOKAHEAD_DAYS = 5;
const NEAREST_AVAILABLE_LOOKAHEAD_DAYS = 30;
const MAX_BOOKINGS_PER_DAY = 3;
const THAI_WEEKDAYS = [
  { key: "อาทิตย์", index: 0 },
  { key: "อังคาร", index: 2 },
  { key: "จันทร์", index: 1 },
  { key: "พุธ", index: 3 },
  { key: "พฤหัส", index: 4 },
  { key: "ศุกร์", index: 5 },
  { key: "เสาร์", index: 6 },
] as const;
const THAI_MONTHS: Record<string, number> = {
  "มกราคม": 0,
  "ม.ค.": 0,
  "มค": 0,
  "กุมภาพันธ์": 1,
  "ก.พ.": 1,
  "กพ": 1,
  "มีนาคม": 2,
  "มี.ค.": 2,
  "มีค": 2,
  "เมษายน": 3,
  "เม.ย.": 3,
  "เมย": 3,
  "พฤษภาคม": 4,
  "พ.ค.": 4,
  "พค": 4,
  "มิถุนายน": 5,
  "มิ.ย.": 5,
  "มิย": 5,
  "กรกฎาคม": 6,
  "ก.ค.": 6,
  "กค": 6,
  "สิงหาคม": 7,
  "ส.ค.": 7,
  "สค": 7,
  "กันยายน": 8,
  "ก.ย.": 8,
  "กย": 8,
  "ตุลาคม": 9,
  "ต.ค.": 9,
  "ตค": 9,
  "พฤศจิกายน": 10,
  "พ.ย.": 10,
  "พย": 10,
  "ธันวาคม": 11,
  "ธ.ค.": 11,
  "ธค": 11,
};

function parseCallbackData(data: string): { recordType: "booking" | "order"; recordId: string; newStatus: string } | null {
  const [action, recordType, recordId, ...statusParts] = data.split(":");
  if (action !== "update" || !recordId || statusParts.length === 0) return null;
  if (recordType !== "booking" && recordType !== "order") return null;
  return { recordType, recordId, newStatus: statusParts.join(":") };
}

function callbackLookup(parsed: { recordType: "booking" | "order"; recordId: string }) {
  if (parsed.recordId.startsWith("id=")) {
    return { column: "id", value: parsed.recordId.slice(3), explicitId: true };
  }

  if (parsed.recordType === "booking") {
    return { column: "job_id", value: parsed.recordId, explicitId: false };
  }

  return { column: "order_id", value: parsed.recordId, explicitId: false };
}

async function updateRecordStatus(
  supabase: ReturnType<typeof createServiceClient>,
  parsed: { recordType: "booking" | "order"; recordId: string },
  newStatus: string,
): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  const table = parsed.recordType === "booking" ? "bookings" : "orders";
  const statusColumn = parsed.recordType === "booking" ? "production_status" : "status";
  const selectColumns = parsed.recordType === "booking" ? "id,job_id" : "id,order_id";
  const lookup = callbackLookup(parsed);
  const patch = { [statusColumn]: newStatus, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq(lookup.column, lookup.value)
    .select(selectColumns)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const row = data as Record<string, unknown>;
    return { ok: true, label: String(row.job_id ?? row.order_id ?? row.id ?? parsed.recordId) };
  }

  if (lookup.explicitId) {
    const fallbackColumn = parsed.recordType === "booking" ? "job_id" : "order_id";
    const { data: fallbackData, error: fallbackError } = await supabase
      .from(table)
      .update(patch)
      .eq(fallbackColumn, lookup.value)
      .select(selectColumns)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    if (fallbackData) {
      const row = fallbackData as Record<string, unknown>;
      return { ok: true, label: String(row.job_id ?? row.order_id ?? row.id ?? parsed.recordId) };
    }
  }

  return { ok: false, reason: `ไม่พบงาน ${parsed.recordId}` };
}

function shouldFridayRespond(message: NonNullable<TelegramUpdate["message"]>): boolean {
  const text = message.text ?? "";
  const normalized = text.toLowerCase();
  const repliedToBot = Boolean(message.reply_to_message?.from?.is_bot);

  return repliedToBot ||
    normalized.includes("friday") ||
    normalized.includes("ฟรายเดย์") ||
    normalized.includes("@wcfriday_bot");
}

function detectDataQuery(text: string): ParsedDataQuery | null {
  const today = dateOnlyInBangkok();
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const target = parseTargetDate(text);
  const asksAvailability = normalized.includes("ว่าง") || normalized.includes("จองได้") || normalized.includes("ช่องว่าง");
  const asksOverdue = normalized.includes("ค้าง") || normalized.includes("เลยกำหนด") || normalized.includes("เกินกำหนด");
  const asksOrder = normalized.includes("order") || normalized.includes("ออเดอร์") || normalized.includes("ส่ง");
  const asksBooking = normalized.includes("คิว") || normalized.includes("นัด") || normalized.includes("ลูกค้า") || normalized.includes("งาน") || normalized.includes("booking") || normalized.includes("จอง");
  const asksFutureWindow = normalized.includes("ล่วงหน้า") || normalized.includes("พรุ่งนี้") || normalized.includes("มะรืน") || normalized.includes("สัปดาห์หน้า") || normalized.includes("อีก");
  const isFutureTarget = Boolean(target && target.date > today);

  if (asksAvailability) {
    return {
      type: "nearest_available",
      targetDate: target?.date ?? addDays(today, 1),
      windowDays: NEAREST_AVAILABLE_LOOKAHEAD_DAYS,
      label: target?.label ?? "วันว่างใกล้สุด",
    };
  }

  if (asksOverdue && asksOrder) {
    return { type: "overdue_orders", targetDate: today, windowDays: 1, label: "งานค้างส่ง" };
  }

  if (asksOverdue) {
    return { type: "overdue_work", targetDate: today, windowDays: 1, label: "งานค้างรวม" };
  }

  if (target) {
    if (asksOrder) {
      return {
        type: isFutureTarget ? "order_window" : "today_due_orders",
        targetDate: target.date,
        windowDays: isFutureTarget ? FUTURE_LOOKAHEAD_DAYS : 1,
        label: target.label,
      };
    }

    return {
      type: isFutureTarget ? "booking_window" : "today_bookings",
      targetDate: target.date,
      windowDays: isFutureTarget ? FUTURE_LOOKAHEAD_DAYS : 1,
      label: target.label,
    };
  }

  if (asksFutureWindow) {
    const futureDate = addDays(today, 1);
    if (asksOrder) {
      return {
        type: "order_window",
        targetDate: futureDate,
        windowDays: FUTURE_LOOKAHEAD_DAYS,
        label: "ล่วงหน้า 5 วัน",
      };
    }
    return {
      type: "booking_window",
      targetDate: futureDate,
      windowDays: FUTURE_LOOKAHEAD_DAYS,
      label: "ล่วงหน้า 5 วัน",
    };
  }

  if (asksOrder) {
    return { type: "today_due_orders", targetDate: today, windowDays: 1, label: "วันนี้" };
  }

  if (asksBooking || normalized.includes("วันนี้")) {
    return { type: "today_bookings", targetDate: today, windowDays: 1, label: "วันนี้" };
  }

  return null;
}

function classifyIntent(text: string): FridayIntent {
  const normalized = text.toLowerCase();
  const commandWords = [
    "แก้",
    "ปรับ",
    "ลบ",
    "ปิด",
    "เปิด",
    "deploy",
    "ส่งจริง",
    "เปลี่ยน schedule",
    "เปลี่ยนเวลา",
    "rotate",
  ];
  const feedbackWords = ["งง", "อ่านยาก", "ไม่ชอบ", "ชอบ", "ยาว", "สั้น", "feedback", "ฟีดแบ็ก"];

  if (commandWords.some((word) => normalized.includes(word))) return "system_command";
  if (detectDataQuery(text)) return "data_query";
  if (feedbackWords.some((word) => normalized.includes(word))) return "feedback";
  return "chat";
}

function isOwnerMessage(userId: number | undefined, ownerId: string | undefined): boolean {
  return Boolean(userId && ownerId && String(userId) === ownerId.trim());
}

function isPoliteUser(username: string | undefined): boolean {
  return String(username ?? "").replace(/^@/, "").toLowerCase() === "jiwmamsom";
}

function bangkokWeekdayIndex(dateString: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00+07:00`));

  switch (weekday) {
    case "Sun": return 0;
    case "Mon": return 1;
    case "Tue": return 2;
    case "Wed": return 3;
    case "Thu": return 4;
    case "Fri": return 5;
    case "Sat": return 6;
    default: return 0;
  }
}

function nextWeekdayDate(fromDate: string, targetIndex: number, forceNextWeek = false): string {
  const currentIndex = bangkokWeekdayIndex(fromDate);
  let delta = (targetIndex - currentIndex + 7) % 7;
  if (delta === 0 && forceNextWeek) delta = 7;
  return addDays(fromDate, delta);
}

function parseTargetDate(text: string): { date: string; label: string } | null {
  const today = dateOnlyInBangkok();
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

  if (normalized.includes("พรุ่งนี้")) {
    return { date: addDays(today, 1), label: "พรุ่งนี้" };
  }

  if (normalized.includes("มะรืน")) {
    return { date: addDays(today, 2), label: "มะรืนนี้" };
  }

  const relativeMatch = normalized.match(/อีก\s*(\d{1,2})\s*วัน/);
  if (relativeMatch) {
    const days = Number(relativeMatch[1]);
    if (Number.isFinite(days) && days > 0) {
      return { date: addDays(today, days), label: `อีก ${days} วัน` };
    }
  }

  const thaiDateMatch = normalized.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})?/);
  if (thaiDateMatch) {
    const day = Number(thaiDateMatch[1]);
    const monthName = thaiDateMatch[2].replace(/\s+/g, "");
    const yearRaw = thaiDateMatch[3];
    const month = THAI_MONTHS[monthName];
    if (month !== undefined) {
      const todayParts = today.split("-");
      let year = yearRaw ? Number(yearRaw) : Number(todayParts[0]);
      if (yearRaw && yearRaw.length === 2) year += 2000;
      let candidate = new Date(Date.UTC(year, month, day));
      let date = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(candidate);
      if (!yearRaw && date < today) {
        candidate = new Date(Date.UTC(year + 1, month, day));
        date = new Intl.DateTimeFormat("en-CA", {
          timeZone: TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(candidate);
      }
      return { date, label: `${day} ${thaiMonthName(month)}` };
    }
  }

  const slashDateMatch = normalized.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (slashDateMatch) {
    const day = Number(slashDateMatch[1]);
    const month = Number(slashDateMatch[2]) - 1;
    const yearRaw = slashDateMatch[3];
    let year = yearRaw ? Number(yearRaw) : Number(today.slice(0, 4));
    if (yearRaw && yearRaw.length === 2) year += 2000;
    let candidate = new Date(Date.UTC(year, month, day));
    let date = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(candidate);
    if (!yearRaw && date < today) {
      candidate = new Date(Date.UTC(year + 1, month, day));
      date = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(candidate);
    }
    return { date, label: `${day}/${month + 1}` };
  }

  for (const weekday of THAI_WEEKDAYS) {
    if (normalized.includes(weekday.key)) {
      const forceNextWeek = normalized.includes("หน้า") || normalized.includes("ถัดไป");
      const date = nextWeekdayDate(today, weekday.index, forceNextWeek);
      return { date, label: `วัน${weekday.key}` };
    }
  }

  return null;
}

function thaiMonthName(monthIndex: number): string {
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return names[monthIndex] ?? "";
}

function formatThaiWeekday(dateString: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00+07:00`));
}

function bookingCoversDay(booking: BookingInfo, day: string): boolean {
  if (!booking.appointment_date || isStopStatus(booking.production_status)) return false;
  if (day < booking.appointment_date) return false;
  if (!booking.pickup_date) return day === booking.appointment_date;
  return day < booking.pickup_date;
}

function countActiveBookingsForDay(bookings: BookingInfo[], day: string): number {
  return bookings.reduce((count, booking) => count + (bookingCoversDay(booking, day) ? 1 : 0), 0);
}

function formatCapacitySummary(count: number): string {
  const remaining = Math.max(MAX_BOOKINGS_PER_DAY - count, 0);
  if (count === 0) return `ว่าง ${MAX_BOOKINGS_PER_DAY} คิว`;
  if (remaining === 0) return "เต็ม";
  return `เหลือ ${remaining} คิว`;
}

function bookingDayLine(day: string, count: number, highlight = false): string {
  const prefix = highlight ? "▶" : "•";
  return `${prefix} ${formatDateThai(day)} (${formatThaiWeekday(day)}) - ${count} งาน / ${formatCapacitySummary(count)}`;
}

function orderDayLine(day: string, count: number): string {
  return `• ${formatDateThai(day)} (${formatThaiWeekday(day)}) - ${count} งาน`;
}

async function loadActiveBookingsUpTo(
  supabase: ReturnType<typeof createServiceClient>,
  endDate: string,
): Promise<BookingInfo[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("customer_name,brand,model,product,appointment_date,pickup_date,production_status")
    .lte("appointment_date", endDate)
    .limit(1000);
  if (error) throw error;

  return ((data ?? []) as BookingInfo[]).filter((booking) => booking.appointment_date && !isStopStatus(booking.production_status));
}

async function loadActiveOrdersBetween(
  supabase: ReturnType<typeof createServiceClient>,
  startDate: string,
  endDate: string,
): Promise<OrderInfo[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("customer_name,brand,model,items,due_date,status")
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .limit(1000);
  if (error) throw error;

  return ((data ?? []) as OrderInfo[]).filter((order) => order.due_date && !isStopStatus(order.status));
}

async function buildBookingWindowReply(
  supabase: ReturnType<typeof createServiceClient>,
  startDate: string,
  windowDays: number,
  label: string,
): Promise<string> {
  const endDate = addDays(startDate, windowDays - 1);
  const bookings = await loadActiveBookingsUpTo(supabase, endDate);
  const days = Array.from({ length: windowDays }, (_, index) => addDays(startDate, index));
  const targetCount = countActiveBookingsForDay(bookings, startDate);

  const lines = days.map((day, index) => {
    const count = countActiveBookingsForDay(bookings, day);
    return bookingDayLine(day, count, index === 0);
  });

  return [
    `🔧 คิวหน้าร้าน ${label} (${formatDateThai(startDate)} ถึง ${formatDateThai(endDate)})`,
    `▶ วันหลัก: ${formatDateThai(startDate)} มี ${targetCount} งาน / ${formatCapacitySummary(targetCount)}`,
    ...lines,
  ].join("\n");
}

async function buildOrderWindowReply(
  supabase: ReturnType<typeof createServiceClient>,
  startDate: string,
  windowDays: number,
  label: string,
): Promise<string> {
  const endDate = addDays(startDate, windowDays - 1);
  const orders = await loadActiveOrdersBetween(supabase, startDate, endDate);
  const days = Array.from({ length: windowDays }, (_, index) => addDays(startDate, index));
  const ordersByDay = new Map<string, OrderInfo[]>();

  for (const day of days) {
    ordersByDay.set(day, []);
  }

  for (const order of orders) {
    if (!order.due_date) continue;
    const bucket = ordersByDay.get(order.due_date);
    if (bucket) bucket.push(order);
  }

  const lines = days.flatMap((day) => {
    const dayOrders = ordersByDay.get(day) ?? [];
    const summary = dayOrders.length
      ? dayOrders.slice(0, 3).map((order) => orderInfoLine(order)).join("\n")
      : "• ไม่มี";
    return [
      orderDayLine(day, dayOrders.length),
      summary.startsWith("• ไม่มี") ? summary : `  ${summary.replaceAll("\n", "\n  ")}`,
    ];
  });

  return [
    `📋 ออเดอร์ช่วง ${label} (${formatDateThai(startDate)} ถึง ${formatDateThai(endDate)})`,
    ...lines,
  ].join("\n");
}

async function buildNearestAvailableReply(
  supabase: ReturnType<typeof createServiceClient>,
  startDate: string,
  windowDays: number,
  label: string,
): Promise<string> {
  const endDate = addDays(startDate, Math.max(windowDays, NEAREST_AVAILABLE_LOOKAHEAD_DAYS) - 1);
  const bookings = await loadActiveBookingsUpTo(supabase, endDate);
  const days = Array.from({ length: Math.max(windowDays, NEAREST_AVAILABLE_LOOKAHEAD_DAYS) }, (_, index) => addDays(startDate, index));
  const availability = days.map((day) => {
    const count = countActiveBookingsForDay(bookings, day);
    return {
      day,
      count,
      remaining: Math.max(MAX_BOOKINGS_PER_DAY - count, 0),
      weekday: bangkokWeekdayIndex(day),
    };
  });

  const nearest = availability.find((slot) => slot.weekday !== 2 && slot.remaining > 0);
  const firstAvailableDays = availability
    .filter((slot) => slot.weekday !== 2 && slot.remaining > 0)
    .slice(0, 4);
  const header = label === "วันว่างใกล้สุด"
    ? `📍 วันว่างใกล้สุด: ${formatDateThai(nearest.day)} (${formatThaiWeekday(nearest.day)})`
    : `📍 ${label} → วันว่างใกล้สุด: ${formatDateThai(nearest.day)} (${formatThaiWeekday(nearest.day)})`;

  if (!nearest) {
    return [
      `📍 ${label} (${formatDateThai(startDate)} เป็นต้นไป)`,
      `ไม่เจอวันว่างใน ${Math.max(windowDays, NEAREST_AVAILABLE_LOOKAHEAD_DAYS)} วันข้างหน้า`,
      "ลองขยายช่วงค้นหาหรือเช็กคิวที่ปล่อยแล้วอีกที",
    ].join("\n");
  }

  return [
    header,
    `เหลือ ${nearest.remaining} คิว`,
    "",
    `ดูต่อได้อีก:`,
    ...firstAvailableDays.map((slot) => `• ${formatDateThai(slot.day)} (${formatThaiWeekday(slot.day)}) - เหลือ ${slot.remaining} คิว`),
  ].join("\n");
}

function bookingInfoLine(booking: BookingInfo, suffix = ""): string {
  return [
    `• ${booking.customer_name ?? "-"}`,
    `| ${booking.brand ?? "-"} ${booking.model ?? "-"}`,
    `| ${booking.product ?? "-"}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function orderInfoLine(order: OrderInfo, suffix = ""): string {
  return [
    `• ${order.customer_name ?? "-"}`,
    `| ${order.brand ?? "-"} ${order.model ?? "-"}`,
    `| ${formatItems(order.items)}`,
    suffix,
  ].filter(Boolean).join(" ");
}

function cappedLines(lines: string[], total: number): string {
  const visible = lines.slice(0, 8);
  const extra = total > visible.length ? [`• ...อีก ${total - visible.length} งาน`] : [];
  return [...visible, ...extra].join("\n") || "• ไม่มี";
}

async function buildDataQueryReply(
  supabase: ReturnType<typeof createServiceClient>,
  query: ParsedDataQuery,
): Promise<string> {
  const today = dateOnlyInBangkok();

  if (query.type === "today_bookings") {
    const bookings = (await loadActiveBookingsUpTo(supabase, today))
      .filter((booking) => bookingCoversDay(booking, today));
    return [
      `วันนี้มีคิวหน้าร้าน ${bookings.length} งาน (${formatDateThai(today)})`,
      `▶ วันนี้: ${bookings.length} งาน / ${formatCapacitySummary(bookings.length)}`,
      cappedLines(bookings.map((booking) =>
        bookingInfoLine(booking, `- นัดเข้า ${formatDateThai(booking.appointment_date)} / รับรถ ${formatDateThai(booking.pickup_date)} / ${booking.production_status ?? "-"}`)
      ), bookings.length),
    ].join("\n");
  }

  if (query.type === "today_due_orders") {
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name,brand,model,items,due_date,status")
      .eq("due_date", today)
      .limit(50);
    if (error) throw error;

    const orders = ((data ?? []) as OrderInfo[]).filter((order) => !isStopStatus(order.status));
    return [
      `ออเดอร์ที่ต้องส่งวันนี้มี ${orders.length} งาน (${formatDateThai(today)})`,
      cappedLines(orders.map((order) => orderInfoLine(order, `- ${order.status ?? "-"}`)), orders.length),
    ].join("\n");
  }

  if (query.type === "booking_window") {
    return buildBookingWindowReply(supabase, query.targetDate, query.windowDays, query.label);
  }

  if (query.type === "order_window") {
    return buildOrderWindowReply(supabase, query.targetDate, query.windowDays, query.label);
  }

  if (query.type === "nearest_available") {
    return buildNearestAvailableReply(supabase, query.targetDate, query.windowDays, query.label);
  }

  const { data: ordersRaw, error: ordersError } = await supabase
    .from("orders")
    .select("customer_name,brand,model,items,due_date,status")
    .lt("due_date", today)
    .limit(100);
  if (ordersError) throw ordersError;

  const overdueOrders = ((ordersRaw ?? []) as OrderInfo[])
    .filter((order) => order.due_date && !isStopStatus(order.status));

  if (query.type === "overdue_orders") {
    return [
      `ออเดอร์ค้างส่งมี ${overdueOrders.length} งาน`,
      cappedLines(overdueOrders.map((order) =>
        orderInfoLine(order, `- เกิน ${diffDays(order.due_date ?? today)} วัน / ${order.status ?? "-"}`)
      ), overdueOrders.length),
    ].join("\n");
  }

  const { data: bookingsRaw, error: bookingsError } = await supabase
    .from("bookings")
    .select("customer_name,brand,model,product,appointment_date,pickup_date,production_status")
    .lt("appointment_date", today)
    .limit(100);
  if (bookingsError) throw bookingsError;

  const overdueBookings = ((bookingsRaw ?? []) as BookingInfo[])
    .filter((booking) => booking.appointment_date && !isStopStatus(booking.production_status));

  return [
    `งานค้างรวมมี ${overdueBookings.length + overdueOrders.length} งาน`,
    "",
    `งานหน้าร้านค้าง ${overdueBookings.length} งาน`,
    cappedLines(overdueBookings.map((booking) =>
      bookingInfoLine(booking, `- ค้าง ${diffDays(booking.appointment_date ?? today)} วัน / ${booking.production_status ?? "-"}`)
    ), overdueBookings.length),
    "",
    `ออเดอร์ค้างส่ง ${overdueOrders.length} งาน`,
    cappedLines(overdueOrders.map((order) =>
      orderInfoLine(order, `- เกิน ${diffDays(order.due_date ?? today)} วัน / ${order.status ?? "-"}`)
    ), overdueOrders.length),
  ].join("\n");
}

async function handleFridayMessage(update: TelegramUpdate): Promise<Response | null> {
  const message = update.message;
  if (!message?.text || message.from?.is_bot) return null;
  if (!shouldFridayRespond(message)) return jsonResponse({ ok: true, ignored: true, reason: "not_for_friday" });

  const supabase = createServiceClient();
  const settings = await getSettings(supabase);
  const configuredChatId = settings.telegram_group_chat_id;
  if (configuredChatId && String(message.chat.id) !== configuredChatId) {
    return jsonResponse({ ok: true, ignored: true, reason: "wrong_chat" });
  }

  const intent = classifyIntent(message.text);
  const isOwner = isOwnerMessage(message.from?.id, settings.friday_owner_telegram_user_id);
  const forcePolite = isPoliteUser(message.from?.username);
  const aiEnabled = settings.friday_ai_enabled === "true";
  const dataQueryType = detectDataQuery(message.text);
  let aiProvider = "fallback";

  let reply = fallbackFridayReply({
    text: message.text,
    firstName: message.from?.first_name,
    username: message.from?.username,
    isOwner,
    intent,
    forcePolite,
  });

  if (intent === "data_query" && dataQueryType) {
    reply = await buildDataQueryReply(supabase, dataQueryType);
    aiProvider = "database";
  } else if (aiEnabled && hasGeminiKey()) {
    try {
      reply = await generateFridayReply({
        text: message.text,
        firstName: message.from?.first_name,
        username: message.from?.username,
        isOwner,
        intent,
        forcePolite,
      });
      aiProvider = "gemini";
    } catch (error) {
      console.error("[telegram-webhook] Gemini reply failed", error);
    }
  }

  await supabase.from("friday_feedback").insert({
    telegram_chat_id: message.chat.id,
    telegram_message_id: message.message_id,
    telegram_user_id: message.from?.id ?? null,
    telegram_username: message.from?.username ?? null,
    telegram_first_name: message.from?.first_name ?? null,
    message_text: message.text,
    intent,
    is_owner: isOwner,
    ai_reply: reply,
    ai_provider: aiProvider,
  });

  await sendTelegramMessage(String(message.chat.id), escapeHtml(reply));
  return jsonResponse({ ok: true, handled: "friday_message", intent, is_owner: isOwner });
}

// Staff reply to customers directly through LINE Official Account Manager, which triggers no
// webhook event line-webhook can see - there's no way to auto-detect "a human just took over".
// This lets staff explicitly pause/resume the AI for a customer by (partial) LINE display name,
// the same name they already see in their own OA Manager conversation list.
async function handlePauseCommand(
  supabase: ReturnType<typeof createServiceClient>,
  audit: ReturnType<typeof createAuditLog>,
  actor: { firstName?: string; username?: string },
  chatId: number,
  action: "pause" | "resume",
  nameQuery: string,
): Promise<void> {
  const { data: matches, error } = await supabase
    .from("customers")
    .select("id, name, paused_until")
    .not("line_uid", "is", null)
    .ilike("name", `%${nameQuery}%`)
    .limit(6);

  if (error) {
    await sendTelegramMessage(String(chatId), `⚠️ ค้นหาลูกค้าไม่สำเร็จ: ${escapeHtml(error.message)}`);
    return;
  }
  if (!matches || matches.length === 0) {
    await sendTelegramMessage(String(chatId), `❌ ไม่พบลูกค้าที่ชื่อมี "${escapeHtml(nameQuery)}"`);
    return;
  }
  if (matches.length > 1) {
    const names = matches.map((m) => `- ${escapeHtml(m.name)}`).join("\n");
    await sendTelegramMessage(String(chatId), `เจอหลายรายการ พิมพ์ชื่อให้เจาะจงกว่านี้:\n${names}`);
    return;
  }

  const customer = matches[0];
  const pausedUntil = action === "pause" ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null;
  const { error: updateError } = await supabase.from("customers").update({ paused_until: pausedUntil }).eq("id", customer.id);
  if (updateError) {
    await sendTelegramMessage(String(chatId), `⚠️ อัปเดตสถานะ AI ไม่สำเร็จ: ${escapeHtml(updateError.message)}`);
    return;
  }

  const auditResult = await audit.record({
    actor: { type: "staff", ...(actor.username || actor.firstName ? { id: actor.username ?? actor.firstName } : {}) },
    action: action === "pause" ? "customer.ai_paused" : "customer.ai_resumed",
    entity: { type: "customer", id: customer.id },
    after: { pausedUntil },
    metadata: { channel: "telegram", nameQuery },
  });
  if (!auditResult.success) console.error("[telegram-webhook] audit record failed", auditResult.error);

  const reply = pausedUntil
    ? `🔇 หยุด AI ตอบ ${escapeHtml(customer.name)} แล้ว 2 ชม. (ถึง ${formatDateTimeThai(new Date(pausedUntil))}) — พิมพ์ /pause ${escapeHtml(nameQuery)} ซ้ำเพื่อขยายเวลา หรือ /resume ${escapeHtml(nameQuery)} เพื่อเปิดกลับก่อนกำหนด`
    : `🔊 เปิด AI ตอบ ${escapeHtml(customer.name)} กลับมาแล้ว`;
  await sendTelegramMessage(String(chatId), reply);
}

serve(async (req) => {
  const functionName = "telegram-webhook";
  console.log(`[${functionName}] Starting...`);
  let callbackForError: TelegramUpdate["callback_query"] | undefined;

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const update = await req.json() as TelegramUpdate;
    // Friday chat replies disabled 2026-07-03 — OpenClaw handles chat in the group now.
    // handleFridayMessage() left intact below in case this needs to flip back on.

    const pauseMatch = update.message?.text?.match(/^\/(pause|resume)\s+(.+)/i);
    if (pauseMatch && update.message) {
      const [, action, nameQuery] = pauseMatch;
      const supabase = createServiceClient();
      const audit = createAuditLog({ store: new SupabaseAuditStore(supabase) });
      await handlePauseCommand(
        supabase,
        audit,
        { firstName: update.message.from?.first_name, username: update.message.from?.username },
        update.message.chat.id,
        action.toLowerCase() as "pause" | "resume",
        nameQuery.trim(),
      );
      return jsonResponse({ ok: true, handled: "pause_command" });
    }

    const callback = update.callback_query;
    callbackForError = callback;
    if (!callback?.data || !callback.message) {
      return jsonResponse({ ok: true, ignored: true });
    }

    const parsed = parseCallbackData(callback.data);
    if (!parsed) {
      await answerCallbackQuery(callback.id, "รูปแบบคำสั่งไม่ถูกต้อง");
      return jsonResponse({ ok: false, error: "Invalid callback data" });
    }

    const supabase = createServiceClient();
    const newStatus = CALLBACK_STATUS_MAP[parsed.newStatus] ?? parsed.newStatus;
    const followupRecordId = parsed.recordId.startsWith("id=") ? parsed.recordId.slice(3) : parsed.recordId;
    console.log(`[${functionName}] Callback received`, { ...parsed, newStatus });

    const updateResult = await updateRecordStatus(supabase, parsed, newStatus);
    if (!updateResult.ok) {
      await answerCallbackQuery(callback.id, updateResult.reason);
      await sendTelegramMessage(
        String(callback.message.chat.id),
        [
          `⚠️ อัปเดตไม่สำเร็จ`,
          `หาเลขงานไม่เจอ: ${escapeHtml(parsed.recordId)}`,
          `สถานะที่กด: ${escapeHtml(newStatus)}`,
          `⏰ ${formatDateTimeThai()}`,
        ].join("\n"),
      );
      console.warn(`[${functionName}] Record not found`, { ...parsed, newStatus });
      return jsonResponse({ ok: false, reason: "record_not_found", ...parsed, newStatus });
    }

    await supabase
      .from("ai_followups")
      .update({
        response_received_at: new Date().toISOString(),
        response_action: newStatus,
      })
      .eq("record_type", parsed.recordType)
      .eq("record_id", followupRecordId)
      .eq("telegram_message_id", callback.message.message_id)
      .eq("telegram_chat_id", callback.message.chat.id)
      .is("response_received_at", null);

    await answerCallbackQuery(callback.id, "✅ อัปเดตสถานะเรียบร้อย");
    await editMessageReplyMarkup(callback.message.chat.id, callback.message.message_id);

    const actor = callback.from?.first_name || callback.from?.username || "Telegram user";
    await sendTelegramMessage(
      String(callback.message.chat.id),
      [
        `✅ อัปเดต ${escapeHtml(updateResult.label)} เป็น "${escapeHtml(newStatus)}" เรียบร้อย`,
        `👷 โดย: ${escapeHtml(actor)}`,
        `⏰ ${formatDateTimeThai()}`,
      ].join("\n"),
    );

    console.log(`[${functionName}] Updated`, { ...parsed, label: updateResult.label, newStatus });
    return jsonResponse({ ok: true, ...parsed, label: updateResult.label, newStatus });
  } catch (error) {
    console.error(`[${functionName}] Error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    if (callbackForError?.id) {
      await answerCallbackQuery(callbackForError.id, "อัปเดตไม่สำเร็จ ลองใหม่หรือแจ้งแอดมิน");
    }
    return jsonResponse({ ok: false, error: message });
  }
});
