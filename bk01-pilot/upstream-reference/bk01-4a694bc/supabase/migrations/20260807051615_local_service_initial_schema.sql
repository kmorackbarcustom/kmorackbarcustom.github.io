-- Initial Database Schema for Local Service Booking SaaS
-- Date: 2026-08-05

CREATE SCHEMA IF NOT EXISTS local_service;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOPS TABLE (Multi-tenant)
CREATE TABLE IF NOT EXISTS local_service.shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(50),
    address TEXT,
    line_oa_id VARCHAR(100),
    promptpay_number VARCHAR(50),
    promptpay_name VARCHAR(255),
    require_deposit BOOLEAN DEFAULT true,
    default_deposit_amount NUMERIC(10, 2) DEFAULT 100.00,
    subscription_status VARCHAR(50) DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SHOP USERS (Staff & Owner Roles)
CREATE TABLE IF NOT EXISTS local_service.shop_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, user_id)
);

-- 3. SERVICES TABLE
CREATE TABLE IF NOT EXISTS local_service.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    deposit_amount NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. STAFF / PROVIDERS TABLE
CREATE TABLE IF NOT EXISTS local_service.staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS local_service.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    line_user_id VARCHAR(100),
    is_blacklisted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, phone)
);

-- 6. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS local_service.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES local_service.customers(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES local_service.staff(id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES local_service.services(id) ON DELETE RESTRICT,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_deposit' CHECK (status IN ('pending_deposit', 'confirmed', 'completed', 'cancelled')),
    deposit_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'verified', 'waived', 'refunded')),
    deposit_price NUMERIC(10, 2) DEFAULT 0.00,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    slip_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_shops_slug ON local_service.shops(slug);
CREATE INDEX IF NOT EXISTS idx_bookings_shop_date ON local_service.bookings(shop_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_customers_shop_phone ON local_service.customers(shop_id, phone);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE local_service.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.shop_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.bookings ENABLE ROW LEVEL SECURITY;

-- Helper Function: Is User Shop Member
CREATE OR REPLACE FUNCTION local_service.is_shop_member(target_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM local_service.shop_users
        WHERE shop_id = target_shop_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: Public Read Access for Shops, Services & Staff (For Customer Booking Page)
CREATE POLICY "Public shops viewable by everyone" ON local_service.shops FOR SELECT USING (is_active = true);
CREATE POLICY "Public services viewable by everyone" ON local_service.services FOR SELECT USING (is_active = true);
CREATE POLICY "Public staff viewable by everyone" ON local_service.staff FOR SELECT USING (is_active = true);

-- RLS: Authenticated Shop Members Full Control
CREATE POLICY "Members manage shop services" ON local_service.services FOR ALL USING (local_service.is_shop_member(shop_id));
CREATE POLICY "Members manage shop staff" ON local_service.staff FOR ALL USING (local_service.is_shop_member(shop_id));
CREATE POLICY "Members view customers" ON local_service.customers FOR ALL USING (local_service.is_shop_member(shop_id));
CREATE POLICY "Members view bookings" ON local_service.bookings FOR ALL USING (local_service.is_shop_member(shop_id));

-- RLS: Public Customer Booking Creation
CREATE POLICY "Public customers insert" ON local_service.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Public bookings insert" ON local_service.bookings FOR INSERT WITH CHECK (true);
