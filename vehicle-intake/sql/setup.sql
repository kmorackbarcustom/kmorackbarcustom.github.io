-- Setup for vehicle_intake_forms table
CREATE TABLE IF NOT EXISTS vehicle_intake_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- ข้อมูลลูกค้า
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  intake_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- ข้อมูลรถ
  vehicle_brand TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_color TEXT,
  license_plate TEXT NOT NULL,
  mileage INTEGER,
  vin_number TEXT,
  
  -- สภาพรถ
  damage_notes TEXT,
  customer_complaint TEXT,
  accessories TEXT,
  note TEXT,
  
  -- รูปภาพ (JSON array of URLs)
  image_urls JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับค้นหา
CREATE INDEX IF NOT EXISTS idx_license_plate ON vehicle_intake_forms(license_plate);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON vehicle_intake_forms(customer_phone);
CREATE INDEX IF NOT EXISTS idx_intake_date ON vehicle_intake_forms(intake_date);

-- RLS Policy
-- Client ที่ใช้ anon key อ่านและเพิ่มข้อมูลได้เท่านั้น
-- การแก้ไข/ลบควรทำผ่าน Supabase Dashboard, service role, หรือระบบ admin/auth แยกต่างหาก
ALTER TABLE vehicle_intake_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations" ON vehicle_intake_forms;
DROP POLICY IF EXISTS "Allow anon select intake forms" ON vehicle_intake_forms;
DROP POLICY IF EXISTS "Allow anon insert intake forms" ON vehicle_intake_forms;

CREATE POLICY "Allow anon select intake forms"
ON vehicle_intake_forms
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anon insert intake forms"
ON vehicle_intake_forms
FOR INSERT
TO anon
WITH CHECK (true);

-- Storage Bucket: vehicle-intake-images
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-intake-images', 'vehicle-intake-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policy: anon อ่านและอัปโหลดรูปได้ แต่ไม่ให้แก้/ลบจาก client
DROP POLICY IF EXISTS "Allow all operations" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload vehicle images" ON storage.objects;

CREATE POLICY "Allow anon read vehicle images"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'vehicle-intake-images');

CREATE POLICY "Allow anon upload vehicle images"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'vehicle-intake-images');
