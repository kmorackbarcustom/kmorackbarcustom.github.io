import { STATUS_LABELS } from "./constants.ts";

export type GroundingEvidence = {
  userMessage: string;
  authoritativeToolResults?: string[];
  structuredDates?: {
    original_date?: string | null;
    requested_date?: string | null;
  };
};

export type GroundingGuardResult = {
  text: string;
  blocked: boolean;
  reason?:
    | "unsupported_vehicle_claim"
    | "unsupported_customer_name_claim"
    | "unsupported_order_status_claim"
    | "unsupported_order_date_claim";
};

const SAFE_FALLBACK =
  "รับทราบครับคุณลูกค้า เดี๋ยวให้ทีมงานช่วยตรวจสอบข้อมูลและยืนยันให้อีกทีครับ";

function normalizeFact(value: string): string {
  return value.toLocaleLowerCase("th-TH")
    .replace(/\s*(ครับ|ค่ะ|คะ|นะครับ|นะคะ)\s*$/i, "")
    .replace(/[\s._\-/]+/g, "")
    .replace(/[()\[\],:;!?"']/g, "");
}

function extractAuthoritativeVehicles(results: string[]): string[] {
  const vehicles: string[] = [];
  for (const result of results) {
    for (const match of result.matchAll(/^\s*รถ:\s*(.+)$/gim)) {
      const value = match[1].trim();
      if (value && value !== "ไม่มีข้อมูลในระบบ") vehicles.push(value);
    }
  }
  return vehicles;
}
function extractAuthoritativeCustomerNames(results: string[]): string[] {
  const names: string[] = [];
  for (const result of results) {
    for (const match of result.matchAll(/^\s*ชื่อลูกค้า:\s*(.+)$/gim)) {
      const value = match[1].trim();
      if (value && value !== "ไม่มีข้อมูลในระบบ") names.push(value);
    }
  }
  return names;
}

function extractExplicitUserCustomerName(text: string): string | null {
  const patterns = [
    /(?:ผม|ฉัน|หนู)ชื่อ(?:ว่า)?\s*([^\n,.!?]+)/i,
    /ชื่อ(?:ผม|ฉัน|หนู)(?:คือ|เป็น)?\s*([^\n,.!?]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function extractExplicitUserVehicle(text: string): string | null {
  const patterns = [
    /รถ(?:ผม|ฉัน|หนู|ของผม|ของฉัน)?\s*(?:รุ่น|คือ|เป็น)\s*([^\n,.!?]+)/i,
    /รุ่นรถ(?:คือ|เป็น)?\s*([^\n,.!?]+)/i,
    /ผมใช้\s*([^\n,.!?]+)/i,
    /ฉันใช้\s*([^\n,.!?]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function extractVehicleClaim(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/^(มี|ทางร้าน|ร้าน|รับทำ|รองรับ|สินค้า|อุปกรณ์)/i.test(trimmed)) return null;
  const patterns = [
    /(?:^|\s)รถรุ่น\s*([^\n,.!?]+)/i,
    /(?:^|\s)รุ่นรถ(?:คือ|เป็น)?\s*([^\n,.!?]+)/i,
    /(?:^|\s)รถ(?:ของคุณ|คุณ|ลูกค้า)?(?:คือ|เป็น)\s*([^\n,.!?]+)/i,
    /(?:^|\s)รถ\s+([A-Za-z0-9ก-๙][^\n,.!?]*)$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function vehicleSupported(claim: string, evidence: GroundingEvidence): boolean {
  const normalizedClaim = normalizeFact(claim);
  const explicit = extractExplicitUserVehicle(evidence.userMessage);
  if (explicit && normalizeFact(explicit) === normalizedClaim) return true;
  return extractAuthoritativeVehicles(evidence.authoritativeToolResults ?? [])
    .some((vehicle) => {
      const normalizedVehicle = normalizeFact(vehicle);
      return normalizedVehicle === normalizedClaim ||
        normalizedVehicle.includes(normalizedClaim) ||
        normalizedClaim.includes(normalizedVehicle);
    });
}

function extractCustomerNameClaim(line: string): string | null {
  const match = line.trim().match(
    /คุณ\s+([^\n,.!?]+?)(?:\s+(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ))?$/i,
  );
  if (!match?.[1]?.trim()) return null;
  const value = match[1].trim();
  return value === "ลูกค้า" ? null : value;
}

function customerNameSupported(
  claim: string,
  evidence: GroundingEvidence,
): boolean {
  const normalizedClaim = normalizeFact(claim);
  const explicit = extractExplicitUserCustomerName(evidence.userMessage);
  if (explicit && normalizeFact(explicit) === normalizedClaim) return true;
  return extractAuthoritativeCustomerNames(
    evidence.authoritativeToolResults ?? [],
  )
    .some((name) => normalizeFact(name) === normalizedClaim);
}

function authoritativeText(evidence: GroundingEvidence): string {
  return (evidence.authoritativeToolResults ?? []).join("\n");
}

const ORDER_STATUS_PHRASES = [
  "เสร็จแล้ว",
  "เสร็จ",
  "กำลังทำ",
  "กำลังผลิต",
  "รอดำเนินการ",
  "รอผลิต",
  "รอเริ่มงาน",
  "พร้อมรับ",
  "นัดรับรถแล้ว",
  "ส่งมอบแล้ว",
  "ยกเลิก",
  "ยังไม่มา",
  "ไม่มาตามนัด",
];

function extractAuthoritativeStatuses(results: string[]): string[] {
  const values = new Set<string>();
  for (const result of results) {
    for (const match of result.matchAll(/สถานะ(?:คิว|ผลิต)?\s*:\s*([^|\n]+)/gi)) {
      const raw = match[1].trim();
      if (!raw || raw === "ไม่มีข้อมูลในระบบ") continue;
      values.add(raw);
      const label = STATUS_LABELS[raw];
      if (label) values.add(label);
    }
  }
  return [...values];
}

function orderStatusSupported(
  line: string,
  evidence: GroundingEvidence,
): boolean {
  if (
    !/(งาน|ออเดอร์|คิว|สถานะ).{0,16}(เสร็จแล้ว|เสร็จ|กำลังทำ|กำลังผลิต|รอดำเนินการ|รอผลิต|รอเริ่มงาน|พร้อมรับ|นัดรับรถแล้ว|ส่งมอบแล้ว|ยกเลิก|ยังไม่มา|ไม่มาตามนัด)/i
      .test(line)
  ) {
    return true;
  }
  const claims = ORDER_STATUS_PHRASES.filter((status) => line.includes(status));
  if (claims.length === 0) return true;
  const authoritativeStatuses = extractAuthoritativeStatuses(
    evidence.authoritativeToolResults ?? [],
  ).map(normalizeFact);
  return claims.every((claim) => {
    const normalizedClaim = normalizeFact(claim);
    return authoritativeStatuses.some((status) =>
      status.includes(normalizedClaim) || normalizedClaim.includes(status)
    );
  });
}

const THAI_MONTHS: Record<string, string> = {
  "ม.ค": "01", "มกราคม": "01",
  "ก.พ": "02", "กุมภาพันธ์": "02",
  "มี.ค": "03", "มีนาคม": "03",
  "เม.ย": "04", "เมษายน": "04",
  "พ.ค": "05", "พฤษภาคม": "05",
  "มิ.ย": "06", "มิถุนายน": "06",
  "ก.ค": "07", "กรกฎาคม": "07",
  "ส.ค": "08", "สิงหาคม": "08",
  "ก.ย": "09", "กันยายน": "09",
  "ต.ค": "10", "ตุลาคม": "10",
  "พ.ย": "11", "พฤศจิกายน": "11",
  "ธ.ค": "12", "ธันวาคม": "12",
};

function dateKeys(value: string, evidenceMode = false): string[] {
  const keys = new Set<string>([normalizeFact(value)]);
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    keys.add(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (evidenceMode) keys.add(`${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  }
  const numeric = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const [, day, month, rawYear] = numeric;
    const md = `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!rawYear || evidenceMode) keys.add(md);
    if (rawYear) {
      let year = Number(rawYear);
      if (year < 100) year += 2000;
      if (year > 2400) year -= 543;
      keys.add(`${year}-${md}`);
    }
  }
  const thai = value.match(/(\d{1,2})\s*(ม\.ค|มกราคม|ก\.พ|กุมภาพันธ์|มี\.ค|มีนาคม|เม\.ย|เมษายน|พ\.ค|พฤษภาคม|มิ\.ย|มิถุนายน|ก\.ค|กรกฎาคม|ส\.ค|สิงหาคม|ก\.ย|กันยายน|ต\.ค|ตุลาคม|พ\.ย|พฤศจิกายน|ธ\.ค|ธันวาคม)\.?\s*(\d{2,4})?/i);
  if (thai) {
    const [, day, monthName, rawYear] = thai;
    const month = THAI_MONTHS[monthName.replace(/\.$/, "")];
    if (month) {
      const md = `${month}-${day.padStart(2, "0")}`;
      if (!rawYear || evidenceMode) keys.add(md);
      if (rawYear) {
        let year = Number(rawYear);
        if (year < 100) year += 2500;
        if (year > 2400) year -= 543;
        keys.add(`${year}-${md}`);
      }
    }
  }
  return [...keys];
}

function extractAuthoritativeDates(results: string[]): string[] {
  const values: string[] = [];
  for (const result of results) {
    for (const match of result.matchAll(/(?:กำหนดส่ง|นัดเข้า|นัดรับ)\s*:\s*([^|\n(]+)/gi)) {
      const value = match[1].trim();
      if (value && value !== "ไม่มีข้อมูลในระบบ") values.push(value);
    }
  }
  return values;
}

function orderDateSupported(
  line: string,
  evidence: GroundingEvidence,
): boolean {
  const match = line.match(
    /(?:กำหนดส่ง|นัดเข้า|นัดรับ)(?:วันที่|วัน|คือ|เป็น|:)?\s*([^\n,!?]+)/i,
  );
  if (!match?.[1]?.trim()) return true;
  const claimKeys = dateKeys(match[1]);
  const evidenceValues = [
    ...extractAuthoritativeDates(evidence.authoritativeToolResults ?? []),
    evidence.structuredDates?.original_date ?? "",
    evidence.structuredDates?.requested_date ?? "",
  ].filter(Boolean);
  const evidenceKeys = new Set(evidenceValues.flatMap((value) => dateKeys(value, true)));
  return claimKeys.some((key) => evidenceKeys.has(key));
}

export function guardGroundedOutput(
  draft: string,
  evidence: GroundingEvidence,
): GroundingGuardResult {
  const lines = draft.split(/\r?\n/);
  const kept: string[] = [];
  let reason: GroundingGuardResult["reason"];

  for (const line of lines) {
    const vehicleClaim = extractVehicleClaim(line);
    if (vehicleClaim && !vehicleSupported(vehicleClaim, evidence)) {
      reason ??= "unsupported_vehicle_claim";
      continue;
    }
    const nameClaim = extractCustomerNameClaim(line);
    if (nameClaim && !customerNameSupported(nameClaim, evidence)) {
      reason ??= "unsupported_customer_name_claim";
      continue;
    }
    if (!orderStatusSupported(line, evidence)) {
      reason ??= "unsupported_order_status_claim";
      continue;
    }
    if (!orderDateSupported(line, evidence)) {
      reason ??= "unsupported_order_date_claim";
      continue;
    }
    kept.push(line);
  }

  if (!reason) return { text: draft, blocked: false };
  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: cleaned || SAFE_FALLBACK,
    blocked: true,
    reason,
  };
}
