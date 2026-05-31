import { diffDays, TIME_ZONE } from "./constants.ts";

type Booking = {
  job_id: string;
  customer_name: string | null;
  phone?: string | null;
  brand: string | null;
  model: string | null;
  product: string | null;
  color: string | null;
  appointment_date: string | null;
  pickup_date: string | null;
  production_status: string | null;
  assigned_mechanic_username?: string | null;
  followup_count?: number | null;
};

type Order = {
  order_id: string;
  customer_name: string | null;
  brand: string | null;
  model: string | null;
  items: unknown;
  color: string | null;
  due_date: string | null;
  status: string | null;
  assigned_mechanic_username?: string | null;
  followup_count?: number | null;
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatDateThai(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00+07:00`));
}

export function formatDateTimeThai(date = new Date()): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function mechanicMention(username: string | null | undefined): string {
  const clean = String(username ?? "").replace(/^@/, "").trim();
  return clean ? `@${escapeHtml(clean)}` : "ยังไม่ระบุช่าง";
}

export function formatItems(items: unknown): string {
  if (!items) return "-";

  if (Array.isArray(items)) {
    return items.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const value = item as Record<string, unknown>;
        return value.name ?? value.product ?? value.title ?? JSON.stringify(item);
      }
      return String(item);
    }).join(" / ");
  }

  if (typeof items === "string") {
    try {
      return formatItems(JSON.parse(items));
    } catch {
      return items;
    }
  }

  return JSON.stringify(items);
}

export function formatBookingFollowup(booking: Booking): string {
  const days = booking.appointment_date ? Math.max(diffDays(booking.appointment_date), 0) : 0;

  return [
    `👤 ลูกค้า: ${escapeHtml(booking.customer_name)}`,
    `🏍️ รถ: ${escapeHtml(booking.brand)} ${escapeHtml(booking.model)}`,
    `📦 งาน: ${escapeHtml(booking.product)}`,
    `📅 นัดเข้า: ${formatDateThai(booking.appointment_date)} (ค้าง ${days} วัน)`,
    `📦 นัดรับ: ${formatDateThai(booking.pickup_date)}`,
    `🔧 ${escapeHtml(booking.production_status)}`,
    `👷 ${mechanicMention(booking.assigned_mechanic_username)}`,
    "",
    "❓ งานนี้ถึงไหนแล้ว?",
  ].join("\n");
}

export function formatOrderFollowup(order: Order): string {
  const dueDelta = order.due_date ? diffDays(order.due_date) : 0;
  const statusText = dueDelta > 0 ? `ค้าง ${dueDelta} วัน` : `เหลือ ${Math.abs(dueDelta)} วัน`;

  return [
    `👤 ลูกค้า: ${escapeHtml(order.customer_name)}`,
    `🏍️ รถ: ${escapeHtml(order.brand)} ${escapeHtml(order.model)}`,
    `📦 งาน: ${escapeHtml(formatItems(order.items))}`,
    `📅 กำหนดส่ง: ${formatDateThai(order.due_date)} (${statusText})`,
    `🔧 ${escapeHtml(order.status)}`,
    `👷 ${mechanicMention(order.assigned_mechanic_username)}`,
    "",
    "❓ งานนี้ถึงไหนแล้ว?",
  ].join("\n");
}

export function formatPickupReminder(booking: Booking, reminderDate: string): string {
  return [
    `📢 <b>แจ้งเตือนนัดรับรถพรุ่งนี้</b> (${formatDateThai(reminderDate)})`,
    "",
    `📋 งาน: ${escapeHtml(booking.job_id)}`,
    `👤 ลูกค้า: ${escapeHtml(booking.customer_name)}`,
    `📞 เบอร์: ${escapeHtml(booking.phone)}`,
    `🏍️ รถ: ${escapeHtml(booking.brand)} ${escapeHtml(booking.model)}`,
    `📦 งาน: ${escapeHtml(booking.product)}`,
    `🔧 สถานะ: ${escapeHtml(booking.production_status)}`,
    `👷 ช่าง: ${mechanicMention(booking.assigned_mechanic_username)}`,
    "",
    "✅ อย่าลืมเตรียมรถให้พร้อม!",
  ].join("\n");
}
