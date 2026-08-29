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

function orderStatusSupported(
  line: string,
  evidence: GroundingEvidence,
): boolean {
  if (
    !/(งาน|ออเดอร์|คิว).{0,12}(เสร็จแล้ว|เสร็จ|กำลังทำ|กำลังผลิต|รอดำเนินการ|รอผลิต|พร้อมรับ|ยกเลิก)/i
      .test(line)
  ) {
    return true;
  }
  const source = normalizeFact(authoritativeText(evidence));
  return [
    "เสร็จแล้ว",
    "เสร็จ",
    "กำลังทำ",
    "กำลังผลิต",
    "รอดำเนินการ",
    "รอผลิต",
    "พร้อมรับ",
    "ยกเลิก",
  ]
    .filter((status) => line.includes(status))
    .every((status) => source.includes(normalizeFact(status)));
}

function orderDateSupported(
  line: string,
  evidence: GroundingEvidence,
): boolean {
  const match = line.match(
    /(?:กำหนดส่ง|นัดเข้า|นัดรับ)(?:วันที่|วัน|คือ|เป็น|:)?\s*([^\n,.!?]+)/i,
  );
  if (!match?.[1]?.trim()) return true;
  const claim = normalizeFact(match[1]);
  if (!claim) return true;
  const source = normalizeFact(authoritativeText(evidence));
  if (source.includes(claim)) return true;
  const dates = evidence.structuredDates;
  return [dates?.original_date, dates?.requested_date]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeFact(value) === claim);
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
