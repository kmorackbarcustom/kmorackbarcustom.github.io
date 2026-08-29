export type RescheduleContext = {
  pending_action?: string | null;
  required_fields?: string[];
  original_date?: string | null;
  requested_date?: string | null;
};

export type RescheduleResult = {
  reply: string;
  nextState: string;
  extractedData: RescheduleContext;
  completed?: { originalDate: string; requestedDate: string };
};

const RESCHEDULE_INTENT =
  /(ขอ|อยาก|รบกวน)?.{0,12}(เลื่อนคิว|เปลี่ยนวันนัด|เลื่อนวันติดตั้ง|เลื่อนวันนัด|เปลี่ยนวัน)/i;
const RESCHEDULE_CANCEL =
  /(ไม่เลื่อนแล้ว|ไม่เปลี่ยนแล้ว|ยกเลิก.{0,8}(เลื่อน|เปลี่ยน)|เอาวันเดิม)/i;
const DATE_TOKEN =
  "(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์|อาทิตย์)|(?:วันนี้|พรุ่งนี้|มะรืน)|(?:\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)";

function normalizeDate(value: string): string {
  const clean = value.trim();
  if (/^(จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์|อาทิตย์)$/.test(clean)) {
    return `วัน${clean}`;
  }
  return clean;
}

function singleDate(text: string): string | null {
  const matches = [...text.matchAll(new RegExp(`(${DATE_TOKEN})`, "gi"))];
  return matches.length === 1 ? normalizeDate(matches[0][1]) : null;
}
function requiredFields(
  originalDate: string | null,
  requestedDate: string | null,
): string[] {
  const fields: string[] = [];
  if (!originalDate) fields.push("original_date");
  if (!requestedDate) fields.push("requested_date");
  return fields;
}

function activeContext(
  originalDate: string | null,
  requestedDate: string | null,
): RescheduleContext {
  return {
    pending_action: "reschedule",
    required_fields: requiredFields(originalDate, requestedDate),
    original_date: originalDate,
    requested_date: requestedDate,
  };
}

function clearedContext(): RescheduleContext {
  return {
    pending_action: null,
    required_fields: [],
    original_date: null,
    requested_date: null,
  };
}

function parseExplicitDates(
  text: string,
): { originalDate?: string; requestedDate?: string } {
  const both = text.match(
    new RegExp(
      `(${DATE_TOKEN})[\\s\\S]{0,30}?(?:เลื่อนเป็น|เปลี่ยนเป็น|เลื่อนไป(?:เป็น)?)[\\s\\S]{0,20}?(${DATE_TOKEN})`,
      "i",
    ),
  );
  if (both) {
    return {
      originalDate: normalizeDate(both[1]),
      requestedDate: normalizeDate(both[2]),
    };
  }
  const original = text.match(
    new RegExp(`(?:วันเดิม|นัดเดิม|เดิม)(?:คือ|เป็น)?\\s*(${DATE_TOKEN})`, "i"),
  );
  const requested = text.match(
    new RegExp(
      `(?:ขอเป็น|ขอวัน|เลื่อนไป(?:เป็น)?|เปลี่ยนเป็น|อยากได้|ต้องการ)\\s*(${DATE_TOKEN})`,
      "i",
    ),
  );
  return {
    originalDate: original ? normalizeDate(original[1]) : undefined,
    requestedDate: requested ? normalizeDate(requested[1]) : undefined,
  };
}

export function processRescheduleMessage(
  context: RescheduleContext,
  text: string,
): RescheduleResult | null {
  const active = context.pending_action === "reschedule";
  if (!active && !RESCHEDULE_INTENT.test(text)) return null;

  if (active && RESCHEDULE_CANCEL.test(text)) {
    return {
      reply: "รับทราบครับ ยกเลิกคำขอเลื่อนคิวแล้วครับ",
      nextState: "IDLE",
      extractedData: clearedContext(),
    };
  }

  let originalDate = active ? context.original_date ?? null : null;
  let requestedDate = active ? context.requested_date ?? null : null;
  const explicit = parseExplicitDates(text);
  originalDate = explicit.originalDate ?? originalDate;
  requestedDate = explicit.requestedDate ?? requestedDate;
  const onlyDate = singleDate(text);
  if (onlyDate && !explicit.originalDate && !explicit.requestedDate) {
    if (originalDate && !requestedDate) requestedDate = onlyDate;
    else if (!originalDate && requestedDate) originalDate = onlyDate;
    else if (!originalDate && !requestedDate) {
      return {
        reply: `ขอถามเพิ่มนิดหนึ่งครับ ${onlyDate} คือวันนัดเดิม หรือวันที่ต้องการเลื่อนไปครับ`,
        nextState: "RESCHEDULE",
        extractedData: activeContext(null, null),
      };
    }
  }

  if (originalDate && requestedDate) {
    return {
      reply:
        `รับข้อมูลแล้วครับ วันนัดเดิม ${originalDate} ต้องการเลื่อนไป ${requestedDate} เดี๋ยวส่งต่อให้ทีมงานยืนยันอีกครั้งครับ`,
      nextState: "IDLE",
      extractedData: clearedContext(),
      completed: { originalDate, requestedDate },
    };
  }

  const missing = requiredFields(originalDate, requestedDate);
  const reply = missing.length === 2
    ? "รับทราบครับ รบกวนแจ้งวันนัดเดิม และวันที่ต้องการเลื่อนมาได้เลยครับ"
    : missing[0] === "original_date"
    ? "รับทราบครับ รบกวนแจ้งวันนัดเดิมด้วยครับ"
    : "รับทราบครับ รบกวนแจ้งวันที่ต้องการเลื่อนไปด้วยครับ";
  return {
    reply,
    nextState: "RESCHEDULE",
    extractedData: activeContext(originalDate, requestedDate),
  };
}
