-- KMO BK01 Gate 4 - end-state dark-deploy baseline
-- GENERATED/REVIEWED FOR KMO ONLY. DO NOT APPLY WITHOUT KMO_BK01_PREFLIGHT.md PASS.
-- Source: KMO controlled copy + verified upstream runtime patch 6e1c0c6.
-- This script intentionally does not mutate existing KMO public.* objects.

BEGIN;

DO $preflight$
BEGIN
  IF to_regnamespace('local_service') IS NOT NULL
     OR to_regnamespace('kmo_booking') IS NOT NULL
     OR to_regnamespace('kmo_bridge') IS NOT NULL THEN
    RAISE EXCEPTION 'KMO_BK01_BASELINE_ABORT: target schema already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='deposit-slips') THEN
    RAISE EXCEPTION 'KMO_BK01_BASELINE_ABORT: deposit-slips bucket already exists';
  END IF;
END
$preflight$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Pin extension visibility for btree_gist operator-class resolution; do not rely on role defaults.
SET LOCAL search_path = pg_catalog, public, extensions;

CREATE SCHEMA local_service;
CREATE SCHEMA kmo_booking;
CREATE SCHEMA kmo_bridge;

REVOKE ALL ON SCHEMA local_service, kmo_booking, kmo_bridge FROM PUBLIC;
GRANT USAGE ON SCHEMA local_service TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA kmo_booking, kmo_bridge TO service_role;

-- Core BK01 tables - normalized fresh baseline.
CREATE TABLE local_service.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  slug varchar(100) NOT NULL UNIQUE,
  phone varchar(50), address text, line_oa_id varchar(100),
  promptpay_number varchar(50), promptpay_name varchar(255),
  require_deposit boolean NOT NULL DEFAULT true,
  default_deposit_amount numeric(10,2) NOT NULL DEFAULT 100.00,
  subscription_status varchar(50) NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz DEFAULT (now()+interval '14 days'),
  is_active boolean NOT NULL DEFAULT true,
  owner_name varchar(255), business_category varchar(255),
  requested_plan varchar(50) NOT NULL DEFAULT 'free_trial' CHECK (requested_plan IN ('free_trial','basic_490','pro_990')),
  registration_idempotency_key uuid UNIQUE,
  customer_cancel_before_hours int CHECK (customer_cancel_before_hours IS NULL OR customer_cancel_before_hours>=0),
  customer_reschedule_before_hours int CHECK (customer_reschedule_before_hours IS NULL OR customer_reschedule_before_hours>=0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_service.shop_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL CHECK (role IN ('owner','admin','staff')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shop_id,user_id)
);

CREATE TABLE local_service.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL, description text, duration_minutes int NOT NULL DEFAULT 30 CHECK(duration_minutes>0),
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK(price>=0), deposit_amount numeric(10,2) DEFAULT 0 CHECK(deposit_amount IS NULL OR deposit_amount>=0),
  is_active boolean NOT NULL DEFAULT true, creation_idempotency_key uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_service.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL, nickname varchar(100), phone varchar(50), is_active boolean NOT NULL DEFAULT true,
  creation_idempotency_key uuid, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_service.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL, phone varchar(50) NOT NULL, email varchar(255), line_user_id varchar(100),
  is_blacklisted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shop_id,phone)
);

CREATE TABLE local_service.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES local_service.customers(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES local_service.staff(id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES local_service.services(id) ON DELETE RESTRICT,
  booking_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'hold' CHECK(status IN ('hold','pending_review','confirmed','completed','cancelled','no_show','expired')),
  deposit_status varchar(50) NOT NULL DEFAULT 'awaiting' CHECK(deposit_status IN ('not_required','awaiting','submitted','verified','rejected','refunded')),
  deposit_price numeric(10,2) DEFAULT 0, total_price numeric(10,2) NOT NULL DEFAULT 0,
  slip_url text, notes text, booking_code varchar(20) UNIQUE, link_token varchar(64), link_token_expires_at timestamptz,
  expires_at timestamptz DEFAULT (now()+interval '15 minutes'), hold_extended boolean NOT NULL DEFAULT false,
  trans_ref varchar(100), slip_submit_count int NOT NULL DEFAULT 0, slip_uploaded_at timestamptz,
  service_price numeric(10,2), service_duration_minutes int, deposit_amount numeric(10,2),
  start_timestamptz timestamptz, end_timestamptz timestamptz,
  booking_range tstzrange GENERATED ALWAYS AS (tstzrange(start_timestamptz,end_timestamptz,'[)')) STORED,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prevent_overlapping_staff_bookings EXCLUDE USING gist (staff_id WITH =, booking_range WITH &&)
    WHERE (status IN ('hold','pending_review','confirmed'))
);

CREATE TABLE local_service.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES local_service.staff(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), is_working_day boolean NOT NULL DEFAULT true,
  work_start time NOT NULL DEFAULT '10:00', work_end time NOT NULL DEFAULT '19:00', break_start time DEFAULT '12:00', break_end time DEFAULT '13:00',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(staff_id,day_of_week)
);

CREATE TABLE local_service.shop_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES local_service.staff(id) ON DELETE CASCADE, holiday_date date NOT NULL, reason text,
  creation_idempotency_key uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shop_id,staff_id,holiday_date)
);

CREATE TABLE local_service.line_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES local_service.customers(id) ON DELETE SET NULL, line_user_id varchar(100) NOT NULL,
  line_display_name varchar(255), line_picture_url text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shop_id,line_user_id)
);

CREATE TABLE local_service.line_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  event_type varchar(50) NOT NULL CHECK(event_type IN ('booking_created','booking_rescheduled','deposit_approved','booking_cancelled','reminder_1h','reminder_24h')),
  recipient_type varchar(20) NOT NULL CHECK(recipient_type IN ('customer','shop_owner')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('sent','failed','pending')),
  error_message text, sent_at timestamptz, idempotency_key text, attempt_count int NOT NULL DEFAULT 0,
  scheduled_for timestamptz, next_retry_at timestamptz
);

CREATE TABLE local_service.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  old_status varchar(50), new_status varchar(50) NOT NULL, old_deposit_status varchar(50), new_deposit_status varchar(50),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);

-- KMO keeps only plan/acceptance compatibility; no Stripe identifiers or webhook state.
CREATE TABLE local_service.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL UNIQUE REFERENCES local_service.shops(id),
  plan varchar(20) NOT NULL DEFAULT 'free_trial' CHECK(plan IN ('free_trial','basic_490','pro_990')),
  status varchar(20) NOT NULL DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_service.booking_recovery_attempts (
  booking_id uuid PRIMARY KEY REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  failed_attempts int NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz
);

CREATE TABLE local_service.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES local_service.shops(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('customer','merchant','platform','system')),
  action text NOT NULL, target_type text NOT NULL, target_id uuid, outcome text NOT NULL DEFAULT 'succeeded',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE local_service.account_closure_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','identity_verified','in_review','approved','rejected','completed')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX idx_bookings_shop_date ON local_service.bookings(shop_id,booking_date);
CREATE UNIQUE INDEX idx_bookings_trans_ref ON local_service.bookings(trans_ref) WHERE trans_ref IS NOT NULL AND trans_ref<>'';
CREATE INDEX idx_bookings_booking_code ON local_service.bookings(booking_code);
CREATE INDEX idx_bookings_expires_at ON local_service.bookings(expires_at) WHERE status='hold';
CREATE INDEX idx_customers_shop_phone ON local_service.customers(shop_id,phone);
CREATE INDEX idx_staff_schedules_staff ON local_service.staff_schedules(staff_id);
CREATE INDEX idx_shop_holidays_date ON local_service.shop_holidays(shop_id,holiday_date);
CREATE INDEX idx_line_users_shop ON local_service.line_users(shop_id,line_user_id);
CREATE INDEX idx_line_logs_booking ON local_service.line_notification_logs(booking_id);
CREATE UNIQUE INDEX services_shop_creation_idempotency_key ON local_service.services(shop_id,creation_idempotency_key) WHERE creation_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX staff_shop_creation_idempotency_key ON local_service.staff(shop_id,creation_idempotency_key) WHERE creation_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX staff_shop_user_unique ON local_service.staff(shop_id,user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX shop_holidays_shop_creation_idempotency_key ON local_service.shop_holidays(shop_id,creation_idempotency_key) WHERE creation_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX shop_holidays_shop_wide_date ON local_service.shop_holidays(shop_id,holiday_date) WHERE staff_id IS NULL;
CREATE UNIQUE INDEX line_notification_idempotency_unique ON local_service.line_notification_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;


-- KMO-only booking extension and bridge/control state.
CREATE TABLE kmo_booking.details (
  booking_id uuid PRIMARY KEY REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  brand text, model text, product text, color text, pickup_date date, images text[], cart_meta jsonb,
  estimated_total numeric(12,2), source text, source_page text, assigned_mechanic_username text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kmo_bridge.customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legacy_customer_id uuid, local_customer_id uuid REFERENCES local_service.customers(id) ON DELETE SET NULL,
  match_basis text, link_status text NOT NULL DEFAULT 'unresolved' CHECK(link_status IN ('unresolved','linked','conflict','legacy_only','bk01_only')),
  last_reconciled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(legacy_customer_id IS NOT NULL OR local_customer_id IS NOT NULL)
);
CREATE UNIQUE INDEX kmo_customer_legacy_unique ON kmo_bridge.customer_links(legacy_customer_id) WHERE legacy_customer_id IS NOT NULL;
CREATE UNIQUE INDEX kmo_customer_local_unique ON kmo_bridge.customer_links(local_customer_id) WHERE local_customer_id IS NOT NULL;

CREATE TABLE kmo_bridge.booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legacy_booking_id bigint, local_booking_id uuid REFERENCES local_service.bookings(id) ON DELETE SET NULL,
  legacy_job_ref text, link_status text NOT NULL DEFAULT 'unresolved' CHECK(link_status IN ('unresolved','linked','conflict','legacy_only','bk01_only')),
  source text, last_reconciled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(legacy_booking_id IS NOT NULL OR local_booking_id IS NOT NULL)
);
CREATE UNIQUE INDEX kmo_booking_legacy_unique ON kmo_bridge.booking_links(legacy_booking_id) WHERE legacy_booking_id IS NOT NULL;
CREATE UNIQUE INDEX kmo_booking_local_unique ON kmo_bridge.booking_links(local_booking_id) WHERE local_booking_id IS NOT NULL;

CREATE TABLE kmo_bridge.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phase text NOT NULL, status text NOT NULL CHECK(status IN ('running','passed','failed','aborted')),
  source_count bigint, target_count bigint, mismatch_count bigint, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE kmo_bridge.cutover_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  phase text NOT NULL CHECK(phase IN ('legacy_active','dark_deploy','shadow','freeze','bk01_primary','stabilized','rollback')),
  rollback_available boolean NOT NULL DEFAULT true, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Final upstream function definitions required by KMO.
CREATE OR REPLACE FUNCTION local_service.is_shop_member(target_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM local_service.shop_users
        WHERE shop_id = target_shop_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION local_service.has_shop_role(
    target_shop_id UUID,
    allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM local_service.shop_users
             WHERE shop_id = target_shop_id
               AND user_id = auth.uid()
               AND role = ANY(allowed_roles)
       );
$$;

CREATE OR REPLACE FUNCTION local_service.is_shop_owner(target_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
    SELECT local_service.has_shop_role(target_shop_id, ARRAY['owner']::TEXT[]);
$$;

CREATE OR REPLACE FUNCTION local_service.current_staff_id(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.id
    FROM local_service.staff s
    JOIN local_service.shop_users su
      ON su.shop_id = s.shop_id
     AND su.user_id = s.user_id
     AND su.role = 'staff'
    WHERE s.shop_id = p_shop_id
      AND s.user_id = (SELECT auth.uid())
      AND s.is_active = true
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION local_service.generate_booking_code()
RETURNS TEXT AS $$
DECLARE
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- Exclude 0, O, 1, I, L, Q
    v_code TEXT;
    v_exists BOOLEAN;
    v_i INT;
BEGIN
    LOOP
        v_code := 'BK-';
        FOR v_i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;

        SELECT EXISTS (
            SELECT 1 FROM local_service.bookings WHERE booking_code = v_code
        ) INTO v_exists;

        EXIT WHEN NOT v_exists;
    END LOOP;

    RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION local_service.generate_link_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
    SELECT upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10))
$$;

CREATE OR REPLACE FUNCTION local_service.get_tier_limits(p_plan text)
RETURNS TABLE(bookings_limit int, staff_limit int, auto_slip_limit int)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, local_service
AS $$
    SELECT
        CASE WHEN p_plan = 'free_trial' OR p_plan IS NULL THEN 50 ELSE 2147483647 END,
        CASE WHEN p_plan = 'pro_990' THEN 10 ELSE 5 END,
        CASE WHEN p_plan = 'basic_490' THEN 0 WHEN p_plan = 'pro_990' THEN 0 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION local_service.authorize_booking_recovery_attempt(p_booking_id uuid,p_recovery_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,local_service AS $$
DECLARE v_booking local_service.bookings%rowtype; v_attempt local_service.booking_recovery_attempts%rowtype; v_valid boolean;
BEGIN
  SELECT * INTO v_booking FROM local_service.bookings WHERE id=p_booking_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_attempt FROM local_service.booking_recovery_attempts WHERE booking_id=p_booking_id FOR UPDATE;
  IF FOUND AND v_attempt.blocked_until > now() THEN RETURN false; END IF;
  v_valid := v_booking.link_token = upper(trim(p_recovery_token))
             AND v_booking.link_token_expires_at IS NOT NULL
             AND v_booking.link_token_expires_at > now();
  IF v_valid THEN
    DELETE FROM local_service.booking_recovery_attempts WHERE booking_id=p_booking_id;
    RETURN true;
  END IF;
  INSERT INTO local_service.booking_recovery_attempts(booking_id,failed_attempts,window_started_at,blocked_until)
  VALUES(p_booking_id,1,now(),NULL)
  ON CONFLICT(booking_id) DO UPDATE SET
    failed_attempts=CASE WHEN booking_recovery_attempts.window_started_at < now()-interval '15 minutes' THEN 1 ELSE booking_recovery_attempts.failed_attempts+1 END,
    window_started_at=CASE WHEN booking_recovery_attempts.window_started_at < now()-interval '15 minutes' THEN now() ELSE booking_recovery_attempts.window_started_at END,
    blocked_until=CASE WHEN booking_recovery_attempts.failed_attempts+1 >= 5 THEN now()+interval '30 minutes' ELSE booking_recovery_attempts.blocked_until END;
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION local_service.enforce_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- On INSERT: skip transition check, just log history
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, NULL, NEW.status, NULL, NEW.deposit_status, v_user_id, 'Initial Booking Created'
        );
        RETURN NEW;
    END IF;

    -- On UPDATE: validate state transition if status changed
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Validation Matrix
        IF (OLD.status = 'hold' AND NEW.status NOT IN ('pending_review', 'confirmed', 'cancelled', 'expired')) THEN
            RAISE EXCEPTION 'Invalid status transition from hold to %', NEW.status;
        ELSIF (OLD.status = 'pending_review' AND NEW.status NOT IN ('confirmed', 'hold', 'cancelled')) THEN
            RAISE EXCEPTION 'Invalid status transition from pending_review to %', NEW.status;
        ELSIF (OLD.status = 'confirmed' AND NEW.status NOT IN ('completed', 'cancelled', 'no_show')) THEN
            RAISE EXCEPTION 'Invalid status transition from confirmed to %', NEW.status;
        ELSIF (OLD.status IN ('completed', 'cancelled', 'no_show', 'expired')) THEN
            RAISE EXCEPTION 'Terminal state % cannot be transitioned to %', OLD.status, NEW.status;
        END IF;

        -- Record Audit History
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, OLD.status, NEW.status, OLD.deposit_status, NEW.deposit_status, v_user_id, 'Status Update'
        );
    ELSIF (OLD.deposit_status IS DISTINCT FROM NEW.deposit_status) THEN
        -- Record Deposit Status Audit History
        INSERT INTO local_service.booking_status_history (
            booking_id, old_status, new_status, old_deposit_status, new_deposit_status, changed_by, reason
        ) VALUES (
            NEW.id, OLD.status, NEW.status, OLD.deposit_status, NEW.deposit_status, v_user_id, 'Deposit Status Update'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION local_service.enforce_shop_booking_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_subscription_status TEXT;
    v_trial_period_end TIMESTAMPTZ;
BEGIN
    SELECT
        sub.status,
        COALESCE(sub.current_period_end, s.trial_ends_at)
    INTO v_subscription_status, v_trial_period_end
    FROM local_service.shops AS s
    LEFT JOIN local_service.subscriptions AS sub
        ON sub.shop_id = s.id
    WHERE s.id = NEW.shop_id
      AND s.is_active = true;

    IF NOT FOUND
       OR v_subscription_status IS NULL
       OR v_subscription_status IN ('canceled', 'incomplete', 'incomplete_expired', 'unpaid')
       OR (
            v_subscription_status = 'trialing'
            AND (
                v_trial_period_end IS NULL
                OR v_trial_period_end <= NOW()
            )
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SHOP_NOT_ACCEPTING_ONLINE_BOOKINGS';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.enqueue_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
        INSERT INTO local_service.line_notification_logs(
            shop_id, booking_id, event_type, recipient_type, status,
            idempotency_key, scheduled_for
        ) VALUES
            (NEW.shop_id, NEW.id, 'booking_created', 'customer', 'pending',
             'confirmation:' || NEW.id::text, now()),
            (NEW.shop_id, NEW.id, 'reminder_24h', 'customer', 'pending',
             'reminder_24h:' || NEW.id::text, NEW.start_timestamptz - interval '24 hours')
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
        UPDATE local_service.line_notification_logs
        SET status = 'failed', error_message = 'Booking cancelled before delivery'
        WHERE booking_id = NEW.id AND status = 'pending' AND event_type LIKE 'reminder_%';
        INSERT INTO local_service.line_notification_logs(shop_id,booking_id,event_type,recipient_type,status,idempotency_key,scheduled_for)
        VALUES(NEW.shop_id,NEW.id,'booking_cancelled','customer','pending','booking_cancelled:'||NEW.id::text,now())
        ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.create_booking_hold(
    p_shop_id UUID,
    p_service_id UUID,
    p_staff_id UUID DEFAULT NULL,
    p_customer_name VARCHAR DEFAULT '',
    p_customer_phone VARCHAR DEFAULT '',
    p_customer_email VARCHAR DEFAULT NULL,
    p_booking_date DATE DEFAULT CURRENT_DATE,
    p_start_time TIME DEFAULT '09:00:00',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_service RECORD;
    v_shop RECORD;
    v_customer_id UUID;
    v_chosen_staff_id UUID := p_staff_id;
    v_deposit_required BOOLEAN;
    v_deposit_amount NUMERIC(10,2) := 0.00;
    v_status VARCHAR(50);
    v_deposit_status VARCHAR(50);
    v_expires_at TIMESTAMPTZ;
    v_booking_code VARCHAR(20);
    v_link_token VARCHAR(10);
    v_start_tz TIMESTAMPTZ;
    v_end_tz TIMESTAMPTZ;
    v_booking_id UUID;
    v_day_of_week INTEGER;
    v_end_time TIME;
    v_constraint_name TEXT;
BEGIN
    IF NULLIF(btrim(p_customer_name), '') IS NULL THEN
        RAISE EXCEPTION 'Customer name is required';
    END IF;
    IF NULLIF(btrim(p_customer_phone), '') IS NULL THEN
        RAISE EXCEPTION 'Customer phone is required';
    END IF;
    IF p_booking_date IS NULL OR p_booking_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Booking date must be today or later';
    END IF;

    SELECT * INTO v_service
    FROM local_service.services
    WHERE id = p_service_id
      AND shop_id = p_shop_id
      AND is_active = true;
    IF v_service.id IS NULL THEN
        RAISE EXCEPTION 'Service not found or inactive';
    END IF;

    SELECT * INTO v_shop
    FROM local_service.shops
    WHERE id = p_shop_id
      AND is_active = true;
    IF v_shop.id IS NULL THEN
        RAISE EXCEPTION 'Shop not found or inactive';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM local_service.shop_holidays h
        WHERE h.shop_id = p_shop_id
          AND h.staff_id IS NULL
          AND h.holiday_date = p_booking_date
    ) THEN
        RAISE EXCEPTION 'Shop is closed on the requested date';
    END IF;

    v_start_tz := (p_booking_date || ' ' || p_start_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end_tz := v_start_tz + (v_service.duration_minutes || ' minutes')::interval;
    v_end_time := (p_start_time + (v_service.duration_minutes || ' minutes')::interval)::time;
    v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

    UPDATE local_service.bookings
    SET status = 'expired',
        updated_at = NOW()
    WHERE shop_id = p_shop_id
      AND status = 'hold'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
      AND tstzrange(start_timestamptz, end_timestamptz, '[)')
          && tstzrange(v_start_tz, v_end_tz, '[)');

    v_deposit_required := COALESCE(v_shop.require_deposit, true);
    IF v_deposit_required THEN
        IF v_service.deposit_amount IS NOT NULL THEN
            v_deposit_amount := v_service.deposit_amount;
        ELSIF v_shop.default_deposit_amount > 0 THEN
            v_deposit_amount := v_shop.default_deposit_amount;
        ELSE
            v_deposit_required := false;
        END IF;
    END IF;

    IF v_deposit_required AND v_deposit_amount > 0 THEN
        v_status := 'hold';
        v_deposit_status := 'awaiting';
        v_expires_at := NOW() + INTERVAL '15 minutes';
    ELSE
        v_status := 'confirmed';
        v_deposit_status := 'not_required';
        v_expires_at := NULL;
        v_deposit_amount := 0.00;
    END IF;

    IF v_chosen_staff_id IS NULL THEN
        SELECT st.id INTO v_chosen_staff_id
        FROM local_service.staff st
        WHERE st.shop_id = p_shop_id
          AND st.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM local_service.shop_holidays h
              WHERE h.shop_id = p_shop_id
                AND h.staff_id = st.id
                AND h.holiday_date = p_booking_date
          )
          AND EXISTS (
              SELECT 1
              FROM local_service.staff_schedules s
              WHERE s.staff_id = st.id
                AND s.day_of_week = v_day_of_week
                AND COALESCE(s.is_working_day, false)
                AND p_start_time >= s.work_start
                AND v_end_time <= s.work_end
                AND NOT (
                    s.break_start IS NOT NULL
                    AND s.break_end IS NOT NULL
                    AND p_start_time < s.break_end
                    AND v_end_time > s.break_start
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM local_service.bookings b
              WHERE b.staff_id = st.id
                AND b.status IN ('hold', 'pending_review', 'confirmed')
                AND (b.expires_at IS NULL OR b.expires_at > NOW())
                AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)')
                    && tstzrange(v_start_tz, v_end_tz, '[)')
          )
        ORDER BY (
            SELECT COUNT(*)
            FROM local_service.bookings b2
            WHERE b2.staff_id = st.id
              AND b2.booking_date = p_booking_date
              AND b2.status IN ('hold', 'pending_review', 'confirmed')
        ) ASC, st.created_at ASC
        LIMIT 1;

        IF v_chosen_staff_id IS NULL THEN
            RAISE EXCEPTION 'No available staff for the requested time slot';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM local_service.staff st
            WHERE st.id = v_chosen_staff_id
              AND st.shop_id = p_shop_id
              AND st.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected staff not found or inactive';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM local_service.shop_holidays h
            WHERE h.shop_id = p_shop_id
              AND h.staff_id = v_chosen_staff_id
              AND h.holiday_date = p_booking_date
        ) THEN
            RAISE EXCEPTION 'Selected staff is off on the requested date';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM local_service.staff_schedules s
            WHERE s.staff_id = v_chosen_staff_id
              AND s.day_of_week = v_day_of_week
              AND COALESCE(s.is_working_day, false)
              AND p_start_time >= s.work_start
              AND v_end_time <= s.work_end
              AND NOT (
                  s.break_start IS NOT NULL
                  AND s.break_end IS NOT NULL
                  AND p_start_time < s.break_end
                  AND v_end_time > s.break_start
              )
        ) THEN
            RAISE EXCEPTION 'Selected staff is outside working hours, on a break, or has no schedule';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM local_service.bookings b
            WHERE b.staff_id = v_chosen_staff_id
              AND b.status IN ('hold', 'pending_review', 'confirmed')
              AND (b.expires_at IS NULL OR b.expires_at > NOW())
              AND tstzrange(b.start_timestamptz, b.end_timestamptz, '[)')
                  && tstzrange(v_start_tz, v_end_tz, '[)')
        ) THEN
            RAISE EXCEPTION 'Selected staff is unavailable during this time slot';
        END IF;
    END IF;

    INSERT INTO local_service.customers (shop_id, name, phone, email)
    VALUES (
        p_shop_id,
        btrim(p_customer_name),
        btrim(p_customer_phone),
        p_customer_email
    )
    ON CONFLICT (shop_id, phone)
    DO UPDATE SET name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, local_service.customers.email)
    RETURNING id INTO v_customer_id;

    v_booking_code := local_service.generate_booking_code();
    v_link_token := local_service.generate_link_token();

    BEGIN
        INSERT INTO local_service.bookings (
            shop_id, customer_id, staff_id, service_id, booking_code, link_token,
            link_token_expires_at, booking_date, start_time, end_time,
            start_timestamptz, end_timestamptz, status, deposit_status,
            service_price, service_duration_minutes, deposit_amount, total_price,
            deposit_price, expires_at, notes
        ) VALUES (
            p_shop_id, v_customer_id, v_chosen_staff_id, p_service_id, v_booking_code, v_link_token,
            NOW() + INTERVAL '24 hours', p_booking_date, p_start_time, v_end_time,
            v_start_tz, v_end_tz, v_status, v_deposit_status,
            v_service.price, v_service.duration_minutes, v_deposit_amount, v_service.price,
            v_deposit_amount, v_expires_at, p_notes
        )
        RETURNING id INTO v_booking_id;
    EXCEPTION
        WHEN exclusion_violation THEN
            GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
            IF v_constraint_name = 'prevent_overlapping_staff_bookings' THEN
                RAISE EXCEPTION USING
                    ERRCODE = 'P0001',
                    MESSAGE = 'Selected staff is unavailable during this time slot';
            END IF;
            RAISE;
    END;

    RETURN json_build_object(
        'booking_id', v_booking_id,
        'booking_code', v_booking_code,
        'link_token', v_link_token,
        'status', v_status,
        'deposit_status', v_deposit_status,
        'deposit_amount', v_deposit_amount,
        'total_price', v_service.price,
        'expires_at', v_expires_at,
        'staff_id', v_chosen_staff_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION local_service.submit_deposit_slip(
    p_booking_id uuid,
    p_recovery_token text,
    p_slip_url text,
    p_trans_ref text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_booking local_service.bookings%rowtype;
BEGIN
    IF p_slip_url !~* ('^' || p_booking_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$')
       OR p_slip_url LIKE '%..%' OR p_slip_url LIKE '%://%' THEN
        RAISE EXCEPTION 'Slip object reference must belong to this booking';
    END IF;
    SELECT * INTO v_booking FROM local_service.bookings WHERE id=p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
    IF NOT local_service.authorize_booking_recovery_attempt(p_booking_id,p_recovery_token) THEN
        RETURN json_build_object('ok',false,'error','Invalid or expired booking recovery token');
    END IF;
    IF v_booking.status <> 'hold' OR v_booking.expires_at IS NULL OR v_booking.expires_at <= now() THEN
        RAISE EXCEPTION 'Booking is not accepting deposit slips';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='deposit-slips' AND o.name=p_slip_url) THEN
        RAISE EXCEPTION 'Slip object was not found in the private deposit-slips bucket';
    END IF;
    UPDATE local_service.bookings SET slip_url=p_slip_url,trans_ref=nullif(btrim(p_trans_ref),''),deposit_status='submitted',status='pending_review',slip_uploaded_at=now(),slip_submit_count=coalesce(slip_submit_count,0)+1,updated_at=now() WHERE id=p_booking_id RETURNING * INTO v_booking;
    RETURN json_build_object('booking_id',v_booking.id,'status',v_booking.status,'deposit_status',v_booking.deposit_status,'slip_object_path',v_booking.slip_url);
END;
$$;

CREATE OR REPLACE FUNCTION local_service.approve_booking_deposit(
    p_booking_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Authentication required';
    END IF;

    SELECT *
      INTO v_booking
      FROM local_service.bookings
     WHERE id = p_booking_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT local_service.is_shop_member(v_booking.shop_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Not authorized for this shop';
    END IF;

    IF v_booking.status <> 'pending_review'
       OR v_booking.deposit_status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted deposit slips pending review can be approved';
    END IF;

    UPDATE local_service.bookings
       SET status = 'confirmed',
           deposit_status = 'verified',
           expires_at = NULL,
           updated_at = NOW()
     WHERE id = p_booking_id;

    RETURN json_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'status', 'confirmed',
        'deposit_status', 'verified'
    );
END;
$$;

CREATE OR REPLACE FUNCTION local_service.reject_deposit_slip(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
BEGIN
    SELECT * INTO v_booking
    FROM local_service.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;
    IF auth.uid() IS NULL OR NOT local_service.is_shop_member(v_booking.shop_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Not authorized for this shop';
    END IF;
    IF v_booking.status <> 'pending_review' OR v_booking.deposit_status <> 'submitted' THEN
        RAISE EXCEPTION 'Only submitted deposit slips can be rejected';
    END IF;

    UPDATE local_service.bookings
    SET status = 'hold',
        deposit_status = 'rejected',
        expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Keep a dedicated reason-bearing audit row. The generic AFTER UPDATE
    -- trigger row is intentionally preserved, so each rejection has two rows.
    INSERT INTO local_service.booking_status_history (
        booking_id,
        old_status,
        new_status,
        old_deposit_status,
        new_deposit_status,
        changed_by,
        reason
    ) VALUES (
        p_booking_id,
        v_booking.status,
        'hold',
        v_booking.deposit_status,
        'rejected',
        auth.uid(),
        COALESCE(NULLIF(btrim(p_reason), ''), 'Slip Rejected by Shop')
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Slip rejected, hold reset to 15 minutes'
    );
END;
$$;

CREATE OR REPLACE FUNCTION local_service.cancel_booking(
    p_booking_id UUID,
    p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_booking local_service.bookings%ROWTYPE;
    v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Authentication required';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_booking
      FROM local_service.bookings
     WHERE id = p_booking_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF NOT local_service.is_shop_member(v_booking.shop_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Not authorized for this shop';
    END IF;

    IF v_booking.status NOT IN ('hold', 'pending_review', 'confirmed') THEN
        RAISE EXCEPTION 'Only active bookings can be cancelled';
    END IF;

    UPDATE local_service.bookings
       SET status = 'cancelled',
           expires_at = NULL,
           notes = CASE
               WHEN NULLIF(BTRIM(notes), '') IS NULL THEN 'Cancellation reason: ' || v_reason
               ELSE notes || E'\nCancellation reason: ' || v_reason
           END,
           updated_at = NOW()
     WHERE id = p_booking_id;

    RETURN json_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'status', 'cancelled'
    );
END;
$$;

CREATE OR REPLACE FUNCTION local_service.create_service(
    p_shop_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_duration_minutes INTEGER,
    p_price NUMERIC,
    p_deposit_amount NUMERIC,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_service_id UUID;
BEGIN
    v_shop_id := p_shop_id;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Service name is required' USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes % 15 <> 0 THEN
        RAISE EXCEPTION 'Duration must be a positive multiple of 15 minutes' USING ERRCODE = '22023';
    END IF;

    IF p_price IS NULL OR p_price < 0
       OR p_deposit_amount IS NULL OR p_deposit_amount < 0
       OR p_deposit_amount > p_price THEN
        RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE = '22023';
    END IF;

    SELECT id
      INTO v_service_id
      FROM local_service.services
     WHERE shop_id = v_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_service_id IS NOT NULL THEN
        RETURN v_service_id;
    END IF;

    INSERT INTO local_service.services (
        shop_id, name, description, duration_minutes, price,
        deposit_amount, is_active, creation_idempotency_key
    ) VALUES (
        v_shop_id, BTRIM(p_name), NULLIF(BTRIM(p_description), ''),
        p_duration_minutes, p_price, p_deposit_amount, true, p_idempotency_key
    )
    RETURNING id INTO v_service_id;

    RETURN v_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.update_service(
    p_service_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_duration_minutes INTEGER,
    p_price NUMERIC,
    p_deposit_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_service local_service.services%ROWTYPE;
BEGIN
    SELECT * INTO v_service
      FROM local_service.services
     WHERE id = p_service_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found';
    END IF;

    IF NOT local_service.has_shop_role(v_service.shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Service name is required' USING ERRCODE = '22023';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes % 15 <> 0 THEN
        RAISE EXCEPTION 'Duration must be a positive multiple of 15 minutes' USING ERRCODE = '22023';
    END IF;

    IF p_price IS NULL OR p_price < 0
       OR p_deposit_amount IS NULL OR p_deposit_amount < 0
       OR p_deposit_amount > p_price THEN
        RAISE EXCEPTION 'Invalid service price or deposit amount' USING ERRCODE = '22023';
    END IF;

    UPDATE local_service.services
       SET name = BTRIM(p_name),
           description = NULLIF(BTRIM(p_description), ''),
           duration_minutes = p_duration_minutes,
           price = p_price,
           deposit_amount = p_deposit_amount
     WHERE id = p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.set_service_active(
    p_service_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id
      FROM local_service.services
     WHERE id = p_service_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service not found';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    UPDATE local_service.services
       SET is_active = p_is_active
     WHERE id = p_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.create_staff(
    p_shop_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_staff_id UUID;
    v_plan TEXT;
    v_limits RECORD;
    v_active_staff_count INT;
BEGIN
    v_shop_id := p_shop_id;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Staff name is required' USING ERRCODE = '22023';
    END IF;

    -- Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸â€žÃ Â¸Â·Ã Â¸â„¢Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â²Ã Â¹ÂÃ Â¸Å¡Ã Â¸Å¡ Idempotent Ã Â¸ÂªÃ Â¸Â³Ã Â¸Â«Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡Ã Â¸â€žÃ Â¸Â³Ã Â¸â€šÃ Â¸Â­Ã Â¹â‚¬Ã Â¸â€Ã Â¸Â´Ã Â¸Â¡Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†Ã Â¸ÂªÃ Â¸Â³Ã Â¹â‚¬Ã Â¸Â£Ã Â¹â€¡Ã Â¸Ë†Ã Â¹â€žÃ Â¸â€ºÃ Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§ (Ã Â¸â€¢Ã Â¹â€°Ã Â¸Â­Ã Â¸â€¡Ã Â¸â€”Ã Â¸Â³Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸ÂÃ Â¹Ë†Ã Â¸Â­Ã Â¸â„¢Ã Â¹â‚¬Ã Â¸Å Ã Â¹â€¡Ã Â¸â€žÃ Â¸â€šÃ Â¸ÂµÃ Â¸â€Ã Â¸Ë†Ã Â¸Â³Ã Â¸ÂÃ Â¸Â±Ã Â¸â€)
    SELECT id
      INTO v_staff_id
      FROM local_service.staff
     WHERE shop_id = v_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_staff_id IS NOT NULL THEN
        RETURN v_staff_id;
    END IF;

    -- Lock the shop's staff-limit slot transactionally so two concurrent
    -- create_staff calls near the limit cannot both pass the COUNT(*) gate.
    PERFORM pg_advisory_xact_lock(hashtext(v_shop_id::text));

    -- Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Ë†Ã Â¸ÂªÃ Â¸Â­Ã Â¸Å¡Ã Â¸â€šÃ Â¸ÂµÃ Â¸â€Ã Â¸Ë†Ã Â¸Â³Ã Â¸ÂÃ Â¸Â±Ã Â¸â€Ã Â¸Å¾Ã Â¸â„¢Ã Â¸Â±Ã Â¸ÂÃ Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸â€¢Ã Â¸Â²Ã Â¸Â¡Ã Â¹ÂÃ Â¸Å¾Ã Â¹â€¡Ã Â¸ÂÃ Â¹â‚¬Ã Â¸ÂÃ Â¸Ë†
    SELECT COALESCE(plan, 'free_trial')
      INTO v_plan
      FROM local_service.subscriptions
     WHERE shop_id = v_shop_id;

    IF NOT FOUND THEN
        v_plan := 'free_trial';
    END IF;

    SELECT staff_limit INTO v_limits FROM local_service.get_tier_limits(v_plan);

    SELECT COUNT(*)
      INTO v_active_staff_count
      FROM local_service.staff
     WHERE shop_id = v_shop_id
       AND is_active = true;

    IF v_active_staff_count >= v_limits.staff_limit THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'STAFF_LIMIT_EXCEEDED';
    END IF;

    INSERT INTO local_service.staff (
        shop_id, name, phone, is_active, creation_idempotency_key
    ) VALUES (
        v_shop_id, BTRIM(p_name), NULLIF(BTRIM(p_phone), ''), true, p_idempotency_key
    )
    RETURNING id INTO v_staff_id;

    RETURN v_staff_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.set_staff_active(
    p_staff_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_current_is_active BOOLEAN;
    v_plan TEXT;
    v_limits RECORD;
    v_active_staff_count INT;
BEGIN
    SELECT shop_id, is_active
      INTO v_shop_id, v_current_is_active
      FROM local_service.staff
     WHERE id = p_staff_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    IF NOT local_service.is_shop_owner(v_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    -- Ã Â¸Â«Ã Â¸Â²Ã Â¸ÂÃ Â¹â‚¬Ã Â¸â€ºÃ Â¹â€¡Ã Â¸â„¢Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¹â‚¬Ã Â¸â€ºÃ Â¸Â´Ã Â¸â€Ã Â¹Æ’Ã Â¸Å Ã Â¹â€°Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸Å¾Ã Â¸â„¢Ã Â¸Â±Ã Â¸ÂÃ Â¸â€¡Ã Â¸Â²Ã Â¸â„¢ (Activate) Ã Â¹Æ’Ã Â¸Â«Ã Â¹â€°Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Ë†Ã Â¹â‚¬Ã Â¸Å Ã Â¹â€¡Ã Â¸â€žÃ Â¸â€šÃ Â¸ÂµÃ Â¸â€Ã Â¸Ë†Ã Â¸Â³Ã Â¸ÂÃ Â¸Â±Ã Â¸â€Ã Â¸Å¾Ã Â¸â„¢Ã Â¸Â±Ã Â¸ÂÃ Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸â€šÃ Â¸Â­Ã Â¸â€¡Ã Â¸Â£Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢
    IF p_is_active = true AND (v_current_is_active IS DISTINCT FROM true) THEN
        -- Lock the shop's staff-limit slot transactionally so two concurrent
        -- set_staff_active/reactivate calls near the limit cannot both pass
        -- the COUNT(*) gate.
        PERFORM pg_advisory_xact_lock(hashtext(v_shop_id::text));

        SELECT COALESCE(plan, 'free_trial')
          INTO v_plan
          FROM local_service.subscriptions
         WHERE shop_id = v_shop_id;

        IF NOT FOUND THEN
            v_plan := 'free_trial';
        END IF;

        SELECT staff_limit INTO v_limits FROM local_service.get_tier_limits(v_plan);

        SELECT COUNT(*)
          INTO v_active_staff_count
          FROM local_service.staff
         WHERE shop_id = v_shop_id
           AND is_active = true;

        IF v_active_staff_count >= v_limits.staff_limit THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'STAFF_LIMIT_EXCEEDED';
        END IF;
    END IF;

    UPDATE local_service.staff
       SET is_active = p_is_active
     WHERE id = p_staff_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.create_shop_holiday(
    p_shop_id UUID,
    p_holiday_date DATE,
    p_reason TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_holiday_id UUID;
BEGIN
    IF NOT local_service.has_shop_role(p_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_holiday_date IS NULL THEN
        RAISE EXCEPTION 'Holiday date is required' USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;

    SELECT id
      INTO v_holiday_id
      FROM local_service.shop_holidays
     WHERE shop_id = p_shop_id
       AND creation_idempotency_key = p_idempotency_key;

    IF v_holiday_id IS NOT NULL THEN
        RETURN v_holiday_id;
    END IF;

    SELECT id
      INTO v_holiday_id
      FROM local_service.shop_holidays
     WHERE shop_id = p_shop_id
       AND staff_id IS NULL
       AND holiday_date = p_holiday_date;

    IF v_holiday_id IS NOT NULL THEN
        RETURN v_holiday_id;
    END IF;

    INSERT INTO local_service.shop_holidays (
        shop_id, staff_id, holiday_date, reason, creation_idempotency_key
    ) VALUES (
        p_shop_id, NULL, p_holiday_date,
        COALESCE(NULLIF(BTRIM(p_reason), ''), 'Ã Â¸Â§Ã Â¸Â±Ã Â¸â„¢Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¾Ã Â¸Â´Ã Â¹â‚¬Ã Â¸Â¨Ã Â¸Â©Ã Â¸Â£Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢Ã Â¸â€žÃ Â¹â€°Ã Â¸Â²'),
        p_idempotency_key
    )
    RETURNING id INTO v_holiday_id;

    RETURN v_holiday_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.delete_shop_holiday(p_holiday_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_staff_id UUID;
BEGIN
    SELECT shop_id, staff_id
      INTO v_shop_id, v_staff_id
      FROM local_service.shop_holidays
     WHERE id = p_holiday_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop holiday not found';
    END IF;

    IF v_staff_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only shop-wide holidays can be managed here' USING ERRCODE = '22023';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    DELETE FROM local_service.shop_holidays WHERE id = p_holiday_id;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.upsert_staff_weekly_schedule(
    p_staff_id UUID,
    p_days JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
    v_shop_id UUID;
    v_day_count INTEGER;
    v_distinct_day_count INTEGER;
    v_invalid_count INTEGER;
BEGIN
    SELECT shop_id
      INTO v_shop_id
      FROM local_service.staff
     WHERE id = p_staff_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    IF NOT local_service.has_shop_role(v_shop_id, ARRAY['owner', 'admin']::TEXT[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner or admin role required';
    END IF;

    IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
        RAISE EXCEPTION 'Schedule days must be a JSON array' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT day_of_week)
      INTO v_day_count, v_distinct_day_count
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      );

    IF v_day_count <> 7 OR v_distinct_day_count <> 7 THEN
        RAISE EXCEPTION 'Schedule must contain each day from 0 through 6 exactly once' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)
      INTO v_invalid_count
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      )
     WHERE day_of_week NOT BETWEEN 0 AND 6
        OR is_working_day IS NULL
        OR work_start IS NULL
        OR work_end IS NULL
        OR work_start >= work_end
        OR ((break_start IS NULL) <> (break_end IS NULL))
        OR (break_start IS NOT NULL AND (
               break_start >= break_end
            OR break_start < work_start
            OR break_end > work_end
        ));

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Invalid work or break time in weekly schedule' USING ERRCODE = '22023';
    END IF;

    INSERT INTO local_service.staff_schedules (
        shop_id, staff_id, day_of_week, is_working_day,
        work_start, work_end, break_start, break_end
    )
    SELECT
        v_shop_id, p_staff_id, day_of_week, is_working_day,
        work_start, work_end, break_start, break_end
      FROM jsonb_to_recordset(p_days) AS day_row(
          day_of_week INTEGER,
          is_working_day BOOLEAN,
          work_start TIME,
          work_end TIME,
          break_start TIME,
          break_end TIME
      )
    ON CONFLICT (staff_id, day_of_week) DO UPDATE
        SET shop_id = EXCLUDED.shop_id,
            is_working_day = EXCLUDED.is_working_day,
            work_start = EXCLUDED.work_start,
            work_end = EXCLUDED.work_end,
            break_start = EXCLUDED.break_start,
            break_end = EXCLUDED.break_end;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.link_staff_user(p_staff_id uuid,p_user_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,local_service,auth AS $$
DECLARE v_staff local_service.staff%rowtype; v_user_id uuid;
BEGIN
  SELECT * INTO v_staff FROM local_service.staff WHERE id=p_staff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff not found'; END IF;
  IF NOT local_service.has_shop_role(v_staff.shop_id,ARRAY['owner']::text[]) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner role required'; END IF;
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email)=lower(trim(p_user_email)) LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No registered user matches that email'; END IF;
  IF NOT EXISTS(SELECT 1 FROM local_service.shop_users WHERE shop_id=v_staff.shop_id AND user_id=v_user_id AND role='staff') THEN RAISE EXCEPTION 'The user must first be a staff member of this shop'; END IF;
  UPDATE local_service.staff SET user_id=v_user_id WHERE id=p_staff_id;
END; $$;

CREATE OR REPLACE FUNCTION local_service.claim_due_line_notifications(p_limit int DEFAULT 25)
RETURNS SETOF local_service.line_notification_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    RETURN QUERY
    WITH due AS (
        SELECT l.id
        FROM local_service.line_notification_logs l
        JOIN local_service.bookings b ON b.id=l.booking_id
        WHERE l.status='pending'
          AND l.scheduled_for <= now()
          AND (l.next_retry_at IS NULL OR l.next_retry_at <= now())
          AND (l.event_type = 'booking_cancelled' OR b.status <> 'cancelled')
        ORDER BY l.scheduled_for
        FOR UPDATE OF l SKIP LOCKED
        LIMIT greatest(1,least(p_limit,100))
    )
    UPDATE local_service.line_notification_logs l
       SET attempt_count=l.attempt_count+1,
           next_retry_at=now()+interval '5 minutes'
      FROM due WHERE l.id=due.id
    RETURNING l.*;
END;
$$;

CREATE OR REPLACE FUNCTION local_service.complete_line_notification(
  p_id uuid,p_attempt_count int,p_status text,p_sent_at timestamptz,p_next_retry_at timestamptz,p_error_message text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,local_service AS $$
DECLARE v_updated int;
BEGIN
  IF p_status NOT IN ('pending','sent','failed') THEN RAISE EXCEPTION 'Invalid notification status'; END IF;
  UPDATE local_service.line_notification_logs
     SET status=p_status,sent_at=p_sent_at,next_retry_at=p_next_retry_at,error_message=left(p_error_message,500)
   WHERE id=p_id AND attempt_count=p_attempt_count AND status='pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END; $$;

CREATE OR REPLACE FUNCTION local_service.customer_cancel_booking(
    p_booking_id uuid,
    p_recovery_token text,
    p_reason text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_booking local_service.bookings%rowtype; v_hours int; v_row record;
BEGIN
    SELECT b, s.customer_cancel_before_hours
      INTO v_row
      FROM local_service.bookings b JOIN local_service.shops s ON s.id = b.shop_id
     WHERE b.id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT local_service.authorize_booking_recovery_attempt(p_booking_id,p_recovery_token) THEN
        RETURN json_build_object('ok',false,'error','Invalid or expired booking recovery token');
    END IF;
    v_booking := v_row.b;
    v_hours := v_row.customer_cancel_before_hours;
    IF v_hours IS NULL THEN RAISE EXCEPTION 'Customer cancellation policy is not configured'; END IF;
    IF v_booking.status NOT IN ('hold','pending_review','confirmed') THEN RAISE EXCEPTION 'Booking is not cancellable'; END IF;
    IF v_booking.start_timestamptz <= now() + make_interval(hours => v_hours) THEN RAISE EXCEPTION 'Cancellation policy window has closed'; END IF;
    IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
    UPDATE local_service.bookings SET status='cancelled', notes=concat_ws(E'\n', notes, 'Customer cancellation: ' || btrim(p_reason)), updated_at=now() WHERE id=p_booking_id;
    INSERT INTO local_service.audit_events(shop_id,actor_type,action,target_type,target_id,metadata)
    VALUES(v_booking.shop_id,'customer','booking_cancelled','booking',p_booking_id,jsonb_build_object('reason',btrim(p_reason)));
    RETURN json_build_object('booking_id',p_booking_id,'status','cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION local_service.customer_reschedule_booking(
    p_booking_id uuid,
    p_recovery_token text,
    p_booking_date date,
    p_start_time time,
    p_reason text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_booking local_service.bookings%rowtype; v_hours int; v_start timestamptz; v_end timestamptz; v_row record;
BEGIN
    SELECT b, s.customer_reschedule_before_hours
      INTO v_row
      FROM local_service.bookings b JOIN local_service.shops s ON s.id=b.shop_id
     WHERE b.id=p_booking_id FOR UPDATE;
    IF NOT FOUND OR NOT local_service.authorize_booking_recovery_attempt(p_booking_id,p_recovery_token) THEN
        RETURN json_build_object('ok',false,'error','Invalid or expired booking recovery token');
    END IF;
    v_booking := v_row.b;
    v_hours := v_row.customer_reschedule_before_hours;
    IF v_hours IS NULL THEN RAISE EXCEPTION 'Customer reschedule policy is not configured'; END IF;
    IF v_booking.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed bookings can be rescheduled'; END IF;
    IF v_booking.start_timestamptz <= now() + make_interval(hours => v_hours) THEN RAISE EXCEPTION 'Reschedule policy window has closed'; END IF;
    IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reschedule reason is required'; END IF;
    v_start := (p_booking_date || ' ' || p_start_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_end := v_start + make_interval(mins => v_booking.service_duration_minutes);
    IF v_start <= now() THEN RAISE EXCEPTION 'New booking time must be in the future'; END IF;
    IF NOT EXISTS (SELECT 1 FROM local_service.staff s WHERE s.id=v_booking.staff_id AND s.shop_id=v_booking.shop_id AND s.is_active=true) THEN RAISE EXCEPTION 'Assigned staff is no longer active'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM local_service.staff_schedules ss
        WHERE ss.shop_id=v_booking.shop_id AND ss.staff_id=v_booking.staff_id
          AND ss.day_of_week=extract(dow from p_booking_date)::int AND ss.is_working_day
          AND p_start_time >= ss.work_start AND (p_start_time + make_interval(mins=>v_booking.service_duration_minutes)) <= ss.work_end
          AND NOT (ss.break_start IS NOT NULL AND ss.break_end IS NOT NULL
                   AND p_start_time < ss.break_end AND (p_start_time + make_interval(mins=>v_booking.service_duration_minutes)) > ss.break_start)
    ) THEN RAISE EXCEPTION 'Requested time is outside staff availability'; END IF;
    IF EXISTS (
      SELECT 1 FROM local_service.shop_holidays h
      WHERE h.shop_id=v_booking.shop_id AND h.holiday_date=p_booking_date
        AND (h.staff_id IS NULL OR h.staff_id=v_booking.staff_id)
    ) THEN RAISE EXCEPTION 'Requested date is closed'; END IF;
    UPDATE local_service.bookings
       SET booking_date=p_booking_date,start_time=p_start_time,end_time=(p_start_time + make_interval(mins=>service_duration_minutes))::time,
           start_timestamptz=v_start,end_timestamptz=v_end,notes=concat_ws(E'\n',notes,'Customer reschedule: '||btrim(p_reason)),updated_at=now()
     WHERE id=p_booking_id;
    UPDATE local_service.line_notification_logs
       SET status='failed',error_message='Superseded by customer reschedule',next_retry_at=NULL
     WHERE booking_id=p_booking_id AND event_type='reminder_24h' AND status='pending';
    INSERT INTO local_service.line_notification_logs(shop_id,booking_id,event_type,recipient_type,status,idempotency_key,scheduled_for)
    VALUES(v_booking.shop_id,p_booking_id,'reminder_24h','customer','pending','reminder_24h:'||p_booking_id::text||':'||extract(epoch from v_start)::bigint::text,v_start-interval '24 hours')
    ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    INSERT INTO local_service.audit_events(shop_id,actor_type,action,target_type,target_id,metadata)
    VALUES(v_booking.shop_id,'customer','booking_rescheduled','booking',p_booking_id,jsonb_build_object('reason',btrim(p_reason),'new_start',v_start));
    INSERT INTO local_service.line_notification_logs(shop_id,booking_id,event_type,recipient_type,status,idempotency_key,scheduled_for)
    VALUES(v_booking.shop_id,p_booking_id,'booking_rescheduled','customer','pending','booking_rescheduled:'||p_booking_id::text||':'||extract(epoch from v_start)::bigint::text,now())
    ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    RETURN json_build_object('booking_id',p_booking_id,'status','confirmed','start_timestamptz',v_start);
END;
$$;

CREATE OR REPLACE FUNCTION local_service.set_booking_outcome(p_booking_id uuid,p_outcome text,p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE v_booking local_service.bookings%rowtype;
BEGIN
    SELECT * INTO v_booking FROM local_service.bookings WHERE id=p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
    IF NOT local_service.has_shop_role(v_booking.shop_id,ARRAY['owner','admin']::text[]) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner or admin role required'; END IF;
    IF p_outcome NOT IN ('completed','no_show') THEN RAISE EXCEPTION 'Invalid booking outcome'; END IF;
    IF v_booking.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed bookings can receive an outcome'; END IF;
    UPDATE local_service.bookings SET status=p_outcome,updated_at=now() WHERE id=p_booking_id;
    INSERT INTO local_service.audit_events(shop_id,actor_user_id,actor_type,action,target_type,target_id,metadata)
    VALUES(v_booking.shop_id,auth.uid(),'merchant','booking_'||p_outcome,'booking',p_booking_id,jsonb_build_object('reason',p_reason));
    RETURN json_build_object('booking_id',p_booking_id,'status',p_outcome);
END;
$$;

CREATE OR REPLACE FUNCTION local_service.export_core_business_data(p_shop_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,local_service AS $$
DECLARE v_result jsonb;
BEGIN
    IF NOT local_service.has_shop_role(p_shop_id,ARRAY['owner']::text[]) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner role required'; END IF;
    SELECT jsonb_build_object(
      'shop',(SELECT to_jsonb(s)-'subscription_status'-'trial_ends_at' FROM local_service.shops s WHERE s.id=p_shop_id),
      'services',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,name,description,duration_minutes,price,deposit_amount,is_active,created_at FROM local_service.services WHERE shop_id=p_shop_id ORDER BY created_at) x),'[]'::jsonb),
      'staff',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,name,nickname,phone,is_active,created_at FROM local_service.staff WHERE shop_id=p_shop_id ORDER BY created_at) x),'[]'::jsonb),
      'customers',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,name,phone,email,created_at FROM local_service.customers WHERE shop_id=p_shop_id ORDER BY created_at) x),'[]'::jsonb),
      'bookings',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,booking_code,customer_id,staff_id,service_id,booking_date,start_time,end_time,status,deposit_status,deposit_amount,total_price,created_at FROM local_service.bookings WHERE shop_id=p_shop_id ORDER BY created_at) x),'[]'::jsonb)
    ) INTO v_result;
    INSERT INTO local_service.audit_events(shop_id,actor_user_id,actor_type,action,target_type,target_id) VALUES(p_shop_id,auth.uid(),'merchant','core_data_exported','shop',p_shop_id);
    RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION local_service.request_account_closure(p_shop_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,local_service AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT local_service.has_shop_role(p_shop_id,ARRAY['owner']::text[]) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner role required'; END IF;
    IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Closure reason is required'; END IF;
    INSERT INTO local_service.account_closure_requests(shop_id,requested_by,reason) VALUES(p_shop_id,auth.uid(),btrim(p_reason)) RETURNING id INTO v_id;
    INSERT INTO local_service.audit_events(shop_id,actor_user_id,actor_type,action,target_type,target_id) VALUES(p_shop_id,auth.uid(),'merchant','account_closure_requested','account_closure_request',v_id);
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION local_service.update_shop_settings(
    p_shop_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_address TEXT,
    p_promptpay_number TEXT,
    p_promptpay_name TEXT,
    p_line_oa_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
BEGIN
    IF NOT local_service.is_shop_owner(p_shop_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner role required';
    END IF;

    IF NULLIF(BTRIM(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'Shop name is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_phone), '') IS NULL THEN
        RAISE EXCEPTION 'Shop phone is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_promptpay_number), '') IS NULL THEN
        RAISE EXCEPTION 'PromptPay number is required' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_promptpay_name), '') IS NULL THEN
        RAISE EXCEPTION 'PromptPay account name is required' USING ERRCODE = '22023';
    END IF;

    UPDATE local_service.shops
       SET name = BTRIM(p_name),
           phone = BTRIM(p_phone),
           address = NULLIF(BTRIM(p_address), ''),
           promptpay_number = BTRIM(p_promptpay_number),
           promptpay_name = BTRIM(p_promptpay_name),
           line_oa_id = NULLIF(BTRIM(p_line_oa_id), ''),
           updated_at = NOW()
     WHERE id = p_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop not found';
    END IF;
END;
$$;

CREATE OR REPLACE VIEW local_service.shop_public_profile AS
SELECT s.id,s.name,s.slug,s.phone,s.address,s.line_oa_id,s.promptpay_number,s.promptpay_name,s.require_deposit,s.default_deposit_amount,
  CASE
    WHEN sub.shop_id IS NULL THEN false
    WHEN sub.status IN ('canceled','incomplete','incomplete_expired','unpaid') THEN false
    WHEN sub.status='trialing' AND COALESCE(sub.current_period_end,s.trial_ends_at) IS NULL THEN false
    WHEN sub.status='trialing' AND COALESCE(sub.current_period_end,s.trial_ends_at)<=now() THEN false
    WHEN sub.status IN ('trialing','active','past_due') THEN true ELSE false
  END AS is_accepting_online_bookings
FROM local_service.shops s LEFT JOIN local_service.subscriptions sub ON sub.shop_id=s.id
WHERE s.is_active=true;


-- Final function search-path hardening inherited from upstream end-state.
ALTER FUNCTION local_service.is_shop_member(uuid) SET search_path=pg_catalog,local_service;
ALTER FUNCTION local_service.generate_booking_code() SET search_path=pg_catalog,local_service;
ALTER FUNCTION local_service.enforce_booking_status_transition() SET search_path=pg_catalog,local_service;
ALTER FUNCTION local_service.reject_deposit_slip(uuid,text) SET search_path=pg_catalog,local_service;

-- Only the three runtime triggers required by the KMO baseline.
CREATE TRIGGER trg_enforce_shop_booking_acceptance BEFORE INSERT ON local_service.bookings
FOR EACH ROW EXECUTE FUNCTION local_service.enforce_shop_booking_acceptance();
CREATE TRIGGER trg_enforce_booking_status_transition AFTER INSERT OR UPDATE ON local_service.bookings
FOR EACH ROW EXECUTE FUNCTION local_service.enforce_booking_status_transition();
CREATE TRIGGER trg_enqueue_booking_notifications AFTER INSERT OR UPDATE OF status ON local_service.bookings
FOR EACH ROW EXECUTE FUNCTION local_service.enqueue_booking_notifications();

-- RLS everywhere. Browser tables are read-only; mutation goes through RPCs.
ALTER TABLE local_service.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.shop_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.shop_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.line_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.line_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.booking_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_service.account_closure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_booking.details ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_bridge.customer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_bridge.booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_bridge.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_bridge.cutover_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KMO public services" ON local_service.services FOR SELECT TO anon USING(is_active=true);
CREATE POLICY "KMO public staff" ON local_service.staff FOR SELECT TO anon USING(is_active=true);
CREATE POLICY "KMO public schedules" ON local_service.staff_schedules FOR SELECT TO anon USING(true);
CREATE POLICY "KMO public holidays" ON local_service.shop_holidays FOR SELECT TO anon USING(true);
CREATE POLICY "KMO own membership" ON local_service.shop_users FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "KMO member shop read" ON local_service.shops FOR SELECT TO authenticated USING(local_service.is_shop_member(id));
CREATE POLICY "KMO merchant services read" ON local_service.services FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]));
CREATE POLICY "KMO merchant staff read" ON local_service.staff FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]) OR id=local_service.current_staff_id(shop_id));
CREATE POLICY "KMO merchant schedules read" ON local_service.staff_schedules FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]) OR staff_id=local_service.current_staff_id(shop_id));
CREATE POLICY "KMO merchant holidays read" ON local_service.shop_holidays FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]));
CREATE POLICY "KMO scoped bookings read" ON local_service.bookings FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]) OR staff_id=local_service.current_staff_id(shop_id));
CREATE POLICY "KMO scoped customers read" ON local_service.customers FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner','admin']::text[]) OR EXISTS(SELECT 1 FROM local_service.bookings b WHERE b.customer_id=customers.id AND b.staff_id=local_service.current_staff_id(customers.shop_id)));
CREATE POLICY "KMO owner subscription read" ON local_service.subscriptions FOR SELECT TO authenticated USING(local_service.is_shop_owner(shop_id));
CREATE POLICY "KMO owner audit read" ON local_service.audit_events FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner']::text[]));
CREATE POLICY "KMO owner closure read" ON local_service.account_closure_requests FOR SELECT TO authenticated USING(local_service.has_shop_role(shop_id,ARRAY['owner']::text[]));

-- Table privileges: anon/authenticated receive only columns used by active clients.
REVOKE ALL ON ALL TABLES IN SCHEMA local_service FROM PUBLIC,anon,authenticated;
GRANT SELECT ON local_service.shop_public_profile TO anon,authenticated;
GRANT SELECT(id,shop_id,name,description,duration_minutes,price,deposit_amount) ON local_service.services TO anon;
GRANT SELECT(id,name,description,duration_minutes,price,deposit_amount,is_active,created_at) ON local_service.services TO authenticated;
GRANT SELECT(id,shop_id,name,nickname) ON local_service.staff TO anon;
GRANT SELECT(id,shop_id,name,nickname,phone,is_active,created_at) ON local_service.staff TO authenticated;
GRANT SELECT(staff_id,day_of_week,is_working_day,work_start,work_end,break_start,break_end) ON local_service.staff_schedules TO anon;
GRANT SELECT(id,shop_id,staff_id,day_of_week,is_working_day,work_start,work_end,break_start,break_end,created_at) ON local_service.staff_schedules TO authenticated;
GRANT SELECT(staff_id,holiday_date,reason) ON local_service.shop_holidays TO anon;
GRANT SELECT(id,shop_id,staff_id,holiday_date,reason,created_at) ON local_service.shop_holidays TO authenticated;
GRANT SELECT(id,name,slug,phone,address,line_oa_id,promptpay_number,promptpay_name,require_deposit,default_deposit_amount,is_active) ON local_service.shops TO authenticated;
GRANT SELECT(shop_id,user_id,role,created_at) ON local_service.shop_users TO authenticated;
GRANT SELECT(id,shop_id,customer_id,staff_id,service_id,booking_date,start_time,end_time,status,deposit_status,deposit_price,total_price,slip_url,notes,booking_code,expires_at,service_price,service_duration_minutes,deposit_amount,start_timestamptz,end_timestamptz,created_at,updated_at) ON local_service.bookings TO authenticated;
GRANT SELECT(id,shop_id,name,phone,email,created_at) ON local_service.customers TO authenticated;
GRANT SELECT(id,shop_id,plan,status,current_period_end,cancel_at_period_end,created_at,updated_at) ON local_service.subscriptions TO authenticated;
GRANT SELECT ON local_service.audit_events,local_service.account_closure_requests TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA local_service TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA kmo_booking,kmo_bridge TO service_role;

-- Function surface: fail closed, then grant exact active APIs/helpers.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA local_service FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION local_service.create_booking_hold(uuid,uuid,uuid,varchar,varchar,varchar,date,time,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION local_service.submit_deposit_slip(uuid,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION local_service.customer_cancel_booking(uuid,text,text) TO anon;
GRANT EXECUTE ON FUNCTION local_service.customer_reschedule_booking(uuid,text,date,time,text) TO anon;
GRANT EXECUTE ON FUNCTION local_service.authorize_booking_recovery_attempt(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION local_service.claim_due_line_notifications(int) TO service_role;
GRANT EXECUTE ON FUNCTION local_service.complete_line_notification(uuid,int,text,timestamptz,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION local_service.approve_booking_deposit(uuid),local_service.cancel_booking(uuid,text),local_service.create_service(uuid,text,text,int,numeric,numeric,uuid),local_service.create_shop_holiday(uuid,date,text,uuid),local_service.create_staff(uuid,text,text,uuid),local_service.delete_shop_holiday(uuid),local_service.export_core_business_data(uuid),local_service.link_staff_user(uuid,text),local_service.reject_deposit_slip(uuid,text),local_service.request_account_closure(uuid,text),local_service.set_booking_outcome(uuid,text,text),local_service.set_service_active(uuid,boolean),local_service.set_staff_active(uuid,boolean),local_service.update_service(uuid,text,text,int,numeric,numeric),local_service.update_shop_settings(uuid,text,text,text,text,text,text),local_service.upsert_staff_weekly_schedule(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION local_service.has_shop_role(uuid,text[]),local_service.is_shop_member(uuid),local_service.is_shop_owner(uuid),local_service.current_staff_id(uuid) TO authenticated;

-- Private deposit-slip bucket. Customer upload uses server-issued signed upload URLs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('deposit-slips','deposit-slips',false,5242880,ARRAY['image/jpeg','image/png','image/webp']::text[]);
CREATE POLICY "KMO BK01 merchant reads deposit slips" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='deposit-slips' AND EXISTS (
    SELECT 1 FROM local_service.bookings b
    WHERE b.id::text=split_part(name,'/',1)
      AND local_service.has_shop_role(b.shop_id,ARRAY['owner','admin']::text[])
  )
);

COMMIT;
