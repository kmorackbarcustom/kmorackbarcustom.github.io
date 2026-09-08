-- Migration for LINE OA Integration, LINE User Mapping & Notification Logs
-- Date: 2026-08-05

-- 1. LINE USERS MAPPING TABLE
CREATE TABLE IF NOT EXISTS local_service.line_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES local_service.customers(id) ON DELETE SET NULL,
    line_user_id VARCHAR(100) NOT NULL,
    line_display_name VARCHAR(255),
    line_picture_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, line_user_id)
);

-- 2. LINE NOTIFICATION LOGS TABLE
CREATE TABLE IF NOT EXISTS local_service.line_notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES local_service.bookings(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('booking_created', 'deposit_approved', 'booking_cancelled', 'reminder_1h', 'reminder_24h')),
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('customer', 'shop_owner')),
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_line_users_shop ON local_service.line_users(shop_id, line_user_id);
CREATE INDEX IF NOT EXISTS idx_line_logs_booking ON local_service.line_notification_logs(booking_id);

-- RLS POLICIES
ALTER TABLE local_service.line_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.line_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public line users insert" ON local_service.line_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Public line logs insert" ON local_service.line_notification_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Members view line users" ON local_service.line_users FOR ALL USING (local_service.is_shop_member(shop_id));
CREATE POLICY "Members view line logs" ON local_service.line_notification_logs FOR ALL USING (local_service.is_shop_member(shop_id));
