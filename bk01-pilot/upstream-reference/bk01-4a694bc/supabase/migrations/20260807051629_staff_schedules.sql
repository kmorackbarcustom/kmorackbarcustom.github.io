-- Migration for Staff Schedules, Break Times, Weekly Off Days & Special Shop Holidays
-- Date: 2026-08-05

-- 1. STAFF SCHEDULES & BREAK TIMES TABLE
CREATE TABLE IF NOT EXISTS local_service.staff_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES local_service.staff(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday... 6=Saturday
    is_working_day BOOLEAN DEFAULT true,
    work_start TIME NOT NULL DEFAULT '10:00:00',
    work_end TIME NOT NULL DEFAULT '19:00:00',
    break_start TIME DEFAULT '12:00:00',
    break_end TIME DEFAULT '13:00:00',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(staff_id, day_of_week)
);

-- 2. SHOP & STAFF HOLIDAYS TABLE (Special Dates Off)
CREATE TABLE IF NOT EXISTS local_service.shop_holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES local_service.staff(id) ON DELETE CASCADE, -- NULL means entire shop holiday
    holiday_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, staff_id, holiday_date)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff ON local_service.staff_schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_shop_holidays_date ON local_service.shop_holidays(shop_id, holiday_date);

-- RLS POLICIES
ALTER TABLE local_service.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.shop_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public staff schedules viewable by everyone" ON local_service.staff_schedules FOR SELECT USING (true);
CREATE POLICY "Public shop holidays viewable by everyone" ON local_service.shop_holidays FOR SELECT USING (true);

CREATE POLICY "Members manage staff schedules" ON local_service.staff_schedules FOR ALL USING (local_service.is_shop_member(shop_id));
CREATE POLICY "Members manage shop holidays" ON local_service.shop_holidays FOR ALL USING (local_service.is_shop_member(shop_id));
