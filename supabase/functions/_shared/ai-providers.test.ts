import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDegenerateText } from "./ai-providers.ts";

Deno.test("isDegenerateText flags token loops", () => {
  assert(isDegenerateText("a a a a a a a a"));
  assert(isDegenerateText("aaaaaaaaaaaa"));
  assert(isDegenerateText("งะงะงะงะงะงะงะงะงะงะ"));
});

Deno.test("isDegenerateText passes real replies", () => {
  for (
    const t of [
      "แร็คหลังคา Ford Ranger ราคา 8,500 บาทครับ ส่วนงานของลูกค้าตอนนี้กำลังทำครับ",
      "ขออภัยครับ ไม่พบข้อมูลในระบบ เดี๋ยวให้ทีมงานติดต่อกลับ รบกวนขอชื่อและเบอร์โทรครับ",
      "สวัสดีครับ ร้าน Kmo Rack Bar Custom รับแต่งรถกระบะ ทำแร็คและบาร์คัสตอมครับ",
      "ครับ ครับ ครับ",
      "ร้านเปิด 8.00-18.00 น. 🔥หยุดทุกวันอังคารครับ🔥",
    ]
  ) {
    assertEquals(isDegenerateText(t), false, t);
  }
});
