import { escapeHtml, formatDateThai } from "../_shared/formatters.ts";

type HolidayBooking = {
  job_id?: unknown;
  customer_name?: unknown;
  brand?: unknown;
  model?: unknown;
  appointment_date?: unknown;
  pickup_date?: unknown;
  hit?: unknown;
};

type HolidayPayload = {
  type?: unknown;
  table?: unknown;
  record?: { date?: unknown; reason?: unknown };
  bookings?: unknown;
};

const value = (input: unknown, max = 100) => escapeHtml(String(input ?? "-").slice(0, max));

function bookingText(booking: HolidayBooking): string {
  const row = booking && typeof booking === "object" ? booking : {};
  const hit = row.hit === "appointment" ? "นัดเข้าร้าน"
    : row.hit === "pickup" ? "วันรับรถ"
    : row.hit === "both" ? "ทั้งสองวัน"
    : "ไม่ระบุตำแหน่ง";
  const bookingDate = (input: unknown) => {
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return value(input, 20);
    try { return escapeHtml(formatDateThai(input)); } catch { return value(input, 20); }
  };
  return [
    `🔖 <code>${value(row.job_id)}</code> · ${value(row.customer_name)}`,
    `🏍️ ${value(row.brand)} ${value(row.model)}`,
    `⚠️ ทับ: ${hit} · นัด ${bookingDate(row.appointment_date)} · รับรถ ${bookingDate(row.pickup_date)}`,
  ].join("\n");
}

export function holidayConflictMessage(payload: HolidayPayload): string | null {
  const date = payload.record?.date;
  if (payload.type !== "HOLIDAY_CONFLICT" || payload.table !== "holidays" ||
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(new Date(`${date}T00:00:00+07:00`).getTime()) || !Array.isArray(payload.bookings)) {
    return null;
  }
  if (payload.bookings.length === 0) return "";

  const bookings = payload.bookings as HolidayBooking[];
  const header = `📅 <b>วันปิดพิเศษ ${formatDateThai(date)}</b>\nเหตุผล: ${value(payload.record?.reason, 300)}`;
  const footer = "พนักงานติดต่อลูกค้าเพื่อนัดใหม่";
  let shown = bookings.slice(0, 20).map(bookingText);
  const render = () => [header, ...shown, bookings.length > shown.length ? `…และอีก ${bookings.length - shown.length} คิว` : "", footer]
    .filter(Boolean).join("\n\n");
  while (shown.length && render().length > 4096) shown = shown.slice(0, -1);
  return render();
}
