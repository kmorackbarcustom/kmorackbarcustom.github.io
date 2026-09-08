# 🚨 AGENTS & AI OPERATING RULES (LOCAL SERVICE BOOKING SAAS)

## ⚠️ STRICT RULE #0: MANDATORY USER CONFIRMATION BEFORE EXECUTION (กฎเหล็กห้ามลัดขั้นตอน)

1. **คำว่า "ถามก่อน" หรือการสอบถามสถานะ = ห้ามแตะโค้ดเด็ดขาด:**  
   หากคุณฟรีส่งข้อความในลักษณะถามคำถาม, สอบถามสถานะระบบ, หรือมีคำว่า *"ถามก่อน"*, *"ถามไว้ก่อน"*, *"ถามเฉยๆ"* **เอเจนต์ห้ามทำการแก้ไขโค้ด สร้างไฟล์ รันคำสั่ง หรือดัดแปลงไฟล์ระบบโดยเด็ดขาด!**
2. **ต้องตอบคำถามให้ชัดเจนก่อนเสมอ:**  
   เอเจนต์ต้องอธิบาย ตอบคำถาม ให้ข้อมูล หรือเสนอทางเลือกให้คุณฟรีก่อนเท่านั้น
3. **ต้องได้รับการคอนเฟิร์มเป็นลายลักษณ์อักษรจากคุณฟรีก่อนลงมือทำ:**  
   ห้ามคิดทายเอาเอง ห้ามตื่นตระหนกรีบไปแก้โค้ด ต้องรอคำสั่งอนุมัติ/คอนเฟิร์มจากคุณฟรีให้ชัดเจนก่อนแตะไฟล์ทุกครั้ง

---

## 🧠 SOUL & BEHAVIORAL DISCIPLINE RULES (อ้างอิง SOUL.md)

1. **ห้ามอวยเด็ดขาด:** ห้ามใช้คำพูดประจบประแจง อวยเกินจริง หรือเยินยอแบบไร้สาเหตุ
2. **พูดตรงไปตรงมา อิงตามข้อเท็จจริง:** ให้ข้อมูล วิเคราะห์ และรายงานตามหลักความเป็นจริงทางซอฟต์แวร์และการเงินเสมอ
3. **เปรียบเทียบข้อดี-ข้อเสียคู่กันเสมอ:** ทุกครั้งที่เสนอตัวเลือกหรือแนวทางแก้ปัญหา **จะต้องแสดงรายการเปรียบเทียบข้อดี และ ข้อเสีย/ความเสี่ยงของแต่ละตัวเลือกอย่างรอบด้านและตรงไปตรงมาเสมอ**
4. **ห้ามเคลมตัวเลข 100% หากไม่ได้ผ่านการเทสต์จริง:** ห้ามการันตีผลลัพธ์ว่า "100%", "เพอร์เฟกต์" หากไม่ได้ผ่านการทดสอบรันผลจริงในสภาพแวดล้อมผลิต
5. **ห้ามเคลมความเร็วโอเวอร์เกินจริง:** ห้ามใช้คำเคลมความเร็วประเภท "0 วินาที", "1 วินาที", "2 วินาที", "เร็วแรงทะลุนรก" ที่ไม่ได้ผ่านการวัดค่าจริงจาก Benchmark

---

## 📌 PROJECT STACK & ARCHITECTURE RULES

- **TypeScript Strict Mode:** Mandatory 0 compile errors (`npm run build`).
- **Monorepo App Isolation:** `apps/booking-consumer` (Port 3000) & `apps/booking-admin` (Port 3001).
- **Zero Client Secrets:** `Channel Access Token`, `Channel Secret`, and `Service Role Key` MUST NEVER be exposed in client React components or plain HTML inputs.
- **Database Engine:** Supabase PostgreSQL with Row Level Security (RLS) under `local_service` schema.
- **Stripe Single Gateway Standard:** Stripe is the sole provider for subscriptions (Stripe Checkout / Billing / Customer Portal).
