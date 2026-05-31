export const TIME_ZONE = "Asia/Bangkok";

export const STOP_STATUS_KEYWORDS = [
  "เสร็จ",
  "done",
  "completed",
  "ยกเลิก",
  "cancel",
  "ส่งมอบ",
  "delivered",
  "ไม่มาตามนัด",
  "ยังไม่มา",
  "no_show",
];

export const BOOKING_STATUS_BUTTONS = [
  ["booking_done", "booking_doing"],
  ["booking_waiting", "booking_pickup"],
  ["booking_cancel", "booking_no_show"],
];

export const ORDER_STATUS_BUTTONS = [
  ["done", "in_progress"],
  ["pending", "completed"],
  ["cancelled"],
];

export const STATUS_LABELS: Record<string, string> = {
  booking_done: "✅ เสร็จแล้ว",
  booking_doing: "🔧 กำลังทำ",
  booking_waiting: "⏳ รอเริ่มงาน",
  booking_pickup: "📦 นัดรับรถแล้ว",
  booking_cancel: "❌ ยกเลิก",
  booking_no_show: "⏰ ยังไม่มา",
  "เสร็จ": "✅ เสร็จแล้ว",
  "กำลังทำ": "🔧 กำลังทำ",
  "รอเริ่มงาน": "⏳ รอเริ่มงาน",
  "นัดรับรถแล้ว": "📦 นัดรับรถแล้ว",
  "ยกเลิก": "❌ ยกเลิก",
  "ไม่มาตามนัด": "⏰ ไม่มาตามนัด",
  "ยังไม่มา": "⏰ ยังไม่มา",
  done: "✅ เสร็จแล้ว",
  in_progress: "🔧 กำลังผลิต",
  pending: "⏳ รอเริ่มงาน",
  completed: "📦 ส่งมอบแล้ว",
  cancelled: "❌ ยกเลิก",
};

export const CALLBACK_STATUS_MAP: Record<string, string> = {
  booking_done: "เสร็จ",
  booking_doing: "กำลังทำ",
  booking_waiting: "รอเริ่มงาน",
  booking_pickup: "นัดรับรถแล้ว",
  booking_cancel: "ยกเลิก",
  booking_no_show: "ยังไม่มา",
};

export function isStopStatus(status: unknown): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return STOP_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function dateOnlyInBangkok(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnlyInBangkok(date);
}

export function diffDays(fromDate: string, toDate = dateOnlyInBangkok()): number {
  const from = new Date(`${fromDate}T00:00:00+07:00`).getTime();
  const to = new Date(`${toDate}T00:00:00+07:00`).getTime();
  return Math.floor((to - from) / 86_400_000);
}
