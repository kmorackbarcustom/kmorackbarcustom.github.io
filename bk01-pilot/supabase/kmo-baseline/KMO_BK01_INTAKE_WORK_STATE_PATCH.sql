-- =============================================================================
-- KMO BK01 - LR-03 / LR03-WU01 - intake + work-state schema patch
-- Purpose:
--   Add five server-only tables under schema kmo_booking:
--     1. kmo_booking.intake_settings            (shop intake capacity config)
--     2. kmo_booking.service_intake_policy      (optional per-service override)
--     3. kmo_booking.booking_intake             (immutable capacity snapshot)
--     4. kmo_booking.booking_work_state         (per-booking work lifecycle)
--     5. kmo_booking.booking_work_state_events  (append-only transition audit)
--   Plus the brief section E staff-hours DB invariant on
--     local_service.staff_schedules.
-- Date: 2026-09-25 (Asia/Bangkok)
-- Dependency:
--   KMO_BK01_BASELINE.sql                 (local_service + kmo_booking schemas,
--                                          local_service.bookings/services/shops,
--                                          GRANT USAGE ON SCHEMA kmo_booking TO
--                                          service_role - line 33)
--   KMO_BK01_SHOP_WEEKLY_SCHEDULE_PATCH.sql (local_service.shop_weekly_schedules -
--                                          the authoritative shop hours source used
--                                          by the section E invariant below)
--   KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql  (weekly fail-closed triggers - READ ONLY;
--                                          not duplicated, not modified, not weakened)
-- DDL outside kmo_booking: NONE.
--   This patch adds no column, index, constraint or table to any non-kmo_booking
--   object. The only non-kmo_booking object it changes is a TRIGGER on the
--   existing local_service.staff_schedules table (brief section E invariant).
-- NO RUNTIME APPLY - reviewable SQL source only. No database connection was made
--   while producing this file. Any apply is LR-08 / Owner-authorized.
-- Idempotent by construction: CREATE TABLE IF NOT EXISTS,
--   CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS
--   before CREATE TRIGGER, REVOKE before GRANT.
--   No default row is ever inserted: a missing kmo_booking.intake_settings row is
--   the fail-closed signal for the public hold/reschedule capacity path.
-- Atomicity: the whole file is one BEGIN ... COMMIT block. A failure anywhere
--   aborts the transaction, so a partial failure cannot leave half-applied state.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Fail-closed privilege hygiene
-- -----------------------------------------------------------------------------
-- service_role needs USAGE on schema kmo_booking. KMO_BK01_BASELINE.sql line 33
-- already grants it (GRANT USAGE ON SCHEMA kmo_booking, kmo_bridge TO service_role),
-- so this block is a no-op in the baseline-deployed state; it exists only so the
-- patch stays self-sufficient if it is ever applied before that line, and so no
-- state is changed when it is not needed.
DO $kmo_booking_schema_usage$
BEGIN
  IF NOT has_schema_privilege('service_role', 'kmo_booking', 'USAGE') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA kmo_booking TO service_role';
  END IF;
END
$kmo_booking_schema_usage$;

-- -----------------------------------------------------------------------------
-- 1. kmo_booking.intake_settings
--    Shop-level intake capacity configuration. Server-only.
--    FAIL-CLOSED CONTRACT: no default row is inserted by this patch. The public
--    hold/reschedule capacity path must treat "no row for this shop" as
--    capacity-unavailable and abort the operation. Absence is the signal; there
--    is deliberately no seed/default INSERT anywhere in this file.
--    updated_by is intentionally a bare uuid (no FK): actor identity is audit
--    metadata and must never block or cascade a capacity-config change.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kmo_booking.intake_settings (
  shop_id uuid PRIMARY KEY REFERENCES local_service.shops(id) ON DELETE CASCADE,
  daily_capacity_units integer NOT NULL CHECK (daily_capacity_units >= 0),
  default_booking_units integer NOT NULL CHECK (default_booking_units >= 1),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE kmo_booking.intake_settings IS
  'KMO shop intake capacity config (server-only). NO default row is created by '
  'KMO_BK01_INTAKE_WORK_STATE_PATCH.sql: a missing row is the fail-closed signal '
  'and the consumer must abort the public hold/reschedule capacity path.';

-- -----------------------------------------------------------------------------
-- 2. kmo_booking.service_intake_policy
--    Optional one-row-per-service override. Server-only.
--    Service override wins; otherwise the shop default from intake_settings applies.
--
--    Shop/service consistency (the referenced service must belong to that shop) is
--    enforced by a RAISING TRIGGER, not by a composite FK.
--    WHY (measured, not assumed): the unit allows a composite FK on
--    (shop_id, service_id) "only if you also show the referenced unique constraint
--    exists on services". It does not. Measured against KMO_BK01_BASELINE.sql,
--    local_service.services declares exactly `id uuid PRIMARY KEY` plus
--    `shop_id uuid NOT NULL REFERENCES local_service.shops(id)` (lines 63-67), and
--    the only unique index on the table is the partial
--    services_shop_creation_idempotency_key on (shop_id, creation_idempotency_key)
--    WHERE creation_idempotency_key IS NOT NULL (line 177). Nothing gives
--    (id, shop_id) a unique guarantee - the PRIMARY KEY on id alone cannot back a
--    composite FK - so a composite FK would be rejected by the engine with
--    "there is no unique constraint matching given keys for referenced table".
--    Adding that constraint to services would in addition be a schema change to a
--    generic local_service object that this unit does not authorize.
--    The trigger keeps the invariant DB-enforced without touching services.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kmo_booking.service_intake_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES local_service.services(id) ON DELETE CASCADE,
  intake_units integer NOT NULL CHECK (intake_units >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_intake_policy_shop
  ON kmo_booking.service_intake_policy(shop_id);

-- The referenced service must actually belong to the row's shop.
-- Plain plpgsql (no SECURITY DEFINER): it only reads and needs no definer rights.
CREATE OR REPLACE FUNCTION kmo_booking.enforce_service_intake_policy_shop_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, local_service, kmo_booking
AS $$
DECLARE
  v_service_shop_id uuid;
BEGIN
  SELECT s.shop_id
    INTO v_service_shop_id
    FROM local_service.services s
   WHERE s.id = NEW.service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_INTAKE_POLICY_SERVICE_NOT_FOUND';
  END IF;

  IF v_service_shop_id IS DISTINCT FROM NEW.shop_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_INTAKE_POLICY_SERVICE_NOT_IN_SHOP';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_intake_policy_shop_scope
  ON kmo_booking.service_intake_policy;
CREATE TRIGGER trg_enforce_service_intake_policy_shop_scope
BEFORE INSERT OR UPDATE OF shop_id, service_id ON kmo_booking.service_intake_policy
FOR EACH ROW EXECUTE FUNCTION kmo_booking.enforce_service_intake_policy_shop_scope();

-- -----------------------------------------------------------------------------
-- 3. kmo_booking.booking_intake
--    IMMUTABLE capacity snapshot, one row per local_service.bookings.id.
--    The browser never submits intake units: the server resolves the policy once
--    at booking creation and records it here permanently. A later configuration
--    change (intake_settings / service_intake_policy) must never rewrite this.
--    snapshot_version is nullable-free bookkeeping so a future snapshot shape can
--    be distinguished without mutating existing rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kmo_booking.booking_intake (
  booking_id uuid PRIMARY KEY REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  intake_units integer NOT NULL CHECK (intake_units >= 1),
  policy_source text NOT NULL CHECK (policy_source IN ('service_override','shop_default')),
  snapshot_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_intake_shop
  ON kmo_booking.booking_intake(shop_id);

COMMENT ON TABLE kmo_booking.booking_intake IS
  'Immutable per-booking capacity snapshot (server-only). UPDATE of booking_id, '
  'shop_id, intake_units or policy_source is rejected by '
  'trg_reject_booking_intake_mutation so later capacity config cannot rewrite history.';

-- Reject any attempt to rewrite the immutable snapshot columns.
-- Plain plpgsql (no SECURITY DEFINER): the function only inspects NEW/OLD and needs
-- no privileges of its own, so it must not carry definer rights.
CREATE OR REPLACE FUNCTION kmo_booking.reject_booking_intake_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.shop_id IS DISTINCT FROM OLD.shop_id
     OR NEW.intake_units IS DISTINCT FROM OLD.intake_units
     OR NEW.policy_source IS DISTINCT FROM OLD.policy_source THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BOOKING_INTAKE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_booking_intake_mutation ON kmo_booking.booking_intake;
CREATE TRIGGER trg_reject_booking_intake_mutation
BEFORE UPDATE ON kmo_booking.booking_intake
FOR EACH ROW EXECUTE FUNCTION kmo_booking.reject_booking_intake_mutation();

-- -----------------------------------------------------------------------------
-- 4. kmo_booking.booking_work_state
--    One row per applicable booking. Transitions are performed only by
--    owner/admin-authorized server RPC paths (delivered by a later unit); this
--    patch stores the state and its actor/timestamps, nothing else.
--    No Order/production mirror and no dual-write is created here - KMO
--    order/production truth stays in public.orders / public.production_allocations.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kmo_booking.booking_work_state (
  booking_id uuid PRIMARY KEY REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES local_service.shops(id) ON DELETE CASCADE,
  work_state text NOT NULL DEFAULT 'WAITING_TO_START'
    CHECK (work_state IN ('WAITING_TO_START','IN_PROGRESS','COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  started_by uuid,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_work_state_shop_state
  ON kmo_booking.booking_work_state(shop_id, work_state);

-- -----------------------------------------------------------------------------
-- 5. kmo_booking.booking_work_state_events
--    Append-only transition audit. shop_id is a bare uuid (no FK) on purpose: an
--    audit record must survive independently of later shop-row changes.
--    Scope note (disclosed, not silently widened): the unit scopes this table's
--    guard to UPDATE and DELETE. TRUNCATE is therefore NOT blocked by this trigger;
--    TRUNCATE requires table ownership and is not reachable by anon/authenticated,
--    which receive no privilege on this table at all.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kmo_booking.booking_work_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES local_service.bookings(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_work_state_events_booking
  ON kmo_booking.booking_work_state_events(booking_id, created_at);

-- Reject UPDATE and DELETE: the event log is append-only.
CREATE OR REPLACE FUNCTION kmo_booking.reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BOOKING_WORK_STATE_EVENTS_APPEND_ONLY';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_work_state_event_mutation ON kmo_booking.booking_work_state_events;
CREATE TRIGGER trg_reject_work_state_event_mutation
BEFORE UPDATE OR DELETE ON kmo_booking.booking_work_state_events
FOR EACH ROW EXECUTE FUNCTION kmo_booking.reject_append_only_mutation();

-- -----------------------------------------------------------------------------
-- 6. Section E - staff-hours DB invariant on local_service.staff_schedules
--
--    AUTHORITATIVE SHOP HOURS SOURCE (stated with evidence):
--      local_service.shop_weekly_schedules.open_time / .close_time for the
--      schedule row's day_of_week.
--    WHY: the unit allowed local_service.shops open/close columns "if present,
--    otherwise the shop-weekly model's open_time/close_time for that day_of_week".
--    Measured against KMO_BK01_BASELINE.sql, local_service.shops (lines 36-53) has
--    NO open/close columns - its only time columns are created_at/updated_at.
--    The shop-weekly model therefore IS the authoritative source, and it is also
--    the model already treated as authoritative by
--    KMO_BK01_KMO_FIRST_HARDENING_PATCH.sql, which fail-closes every booking
--    against local_service.shop_weekly_schedules
--    (trg_enforce_shop_weekly_booking_hours). Keying staff hours to any other
--    source would let staff hours contradict booking acceptance.
--
--    FAIL-CLOSED SEMANTICS: a staff row outside shop hours is rejected, and so is
--    a staff row for a weekday with NO shop-weekly row or with is_open = false.
--    "Unknown hours" must never mean "allowed" - that matches the hardened booking
--    path (SHOP_WEEKLY_SCHEDULE_NOT_CONFIGURED / SHOP_CLOSED_RECURRING_WEEKDAY).
--
--    This trigger is additive. It does not modify, duplicate or weaken
--    trg_enforce_shop_weekly_booking_hours or
--    local_service.enforce_shop_weekly_booking_hours() (weekly fail-closed stays intact).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION local_service.enforce_staff_hours_within_shop_hours()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service
AS $$
DECLARE
  v_is_open    boolean;
  v_open_time  time;
  v_close_time time;
  v_work_start time := NEW.work_start;
  v_work_end   time := NEW.work_end;
BEGIN
  -- Non-working days carry no working hours to bound.
  IF NOT COALESCE(NEW.is_working_day, false) THEN
    RETURN NEW;
  END IF;

  -- Incomplete working hours are not this invariant's business: NOT NULL is the
  -- baseline column contract and upsert_staff_weekly_schedule already rejects
  -- NULL/inverted work hours. Never widen this into a permissive case.
  IF v_work_start IS NULL OR v_work_end IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_work_end <= v_work_start THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFF_HOURS_OUTSIDE_SHOP_HOURS';
  END IF;

  SELECT s.is_open, s.open_time, s.close_time
    INTO v_is_open, v_open_time, v_close_time
    FROM local_service.shop_weekly_schedules s
   WHERE s.shop_id = NEW.shop_id
     AND s.day_of_week = NEW.day_of_week;

  IF NOT FOUND
     OR NOT COALESCE(v_is_open, false)
     OR v_open_time IS NULL
     OR v_close_time IS NULL
     OR v_work_start < v_open_time
     OR v_work_end > v_close_time THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFF_HOURS_OUTSIDE_SHOP_HOURS';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_hours_within_shop_hours ON local_service.staff_schedules;
CREATE TRIGGER trg_enforce_staff_hours_within_shop_hours
BEFORE INSERT OR UPDATE OF shop_id, day_of_week, is_working_day, work_start, work_end
ON local_service.staff_schedules
FOR EACH ROW EXECUTE FUNCTION local_service.enforce_staff_hours_within_shop_hours();

-- -----------------------------------------------------------------------------
-- 7. Fail-closed function surface
--    New functions get EXECUTE to PUBLIC by default; revoke it. Trigger functions
--    need no EXECUTE grant to fire.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION kmo_booking.enforce_service_intake_policy_shop_scope()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION kmo_booking.reject_booking_intake_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION kmo_booking.reject_append_only_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION local_service.enforce_staff_hours_within_shop_hours()
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. RLS on every new table (server-only schema; RLS is enabled regardless)
-- -----------------------------------------------------------------------------
ALTER TABLE kmo_booking.intake_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_booking.service_intake_policy     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_booking.booking_intake            ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_booking.booking_work_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kmo_booking.booking_work_state_events ENABLE ROW LEVEL SECURITY;

-- No policy is created for anon or authenticated: with RLS enabled and no policy,
-- those roles are denied by default. Browser has no privileged table write here.

-- -----------------------------------------------------------------------------
-- 9. Table privileges - server-only, explicitly revoked then narrowly granted
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE kmo_booking.intake_settings           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmo_booking.service_intake_policy     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmo_booking.booking_intake            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmo_booking.booking_work_state        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmo_booking.booking_work_state_events FROM PUBLIC, anon, authenticated;

-- service_role is the only granted role, and only with what each table needs.
GRANT SELECT, INSERT, UPDATE ON kmo_booking.intake_settings     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON kmo_booking.service_intake_policy TO service_role;
GRANT SELECT, INSERT ON kmo_booking.booking_intake             TO service_role;
GRANT SELECT, INSERT, UPDATE ON kmo_booking.booking_work_state  TO service_role;
GRANT SELECT, INSERT ON kmo_booking.booking_work_state_events   TO service_role;

COMMIT;
