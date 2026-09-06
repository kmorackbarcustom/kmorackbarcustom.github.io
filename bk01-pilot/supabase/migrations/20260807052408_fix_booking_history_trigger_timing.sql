-- Fix: enforce_booking_status_transition() inserts into booking_status_history
-- referencing NEW.id, but booking_status_history.booking_id has a FK to
-- bookings.id. As a BEFORE INSERT trigger, the bookings row does not exist
-- yet when that insert runs, so every booking creation failed with a foreign
-- key violation. Switching to AFTER INSERT OR UPDATE fixes this; the function
-- only validates/logs and never mutates NEW, so AFTER is safe for both ops.
-- Date: 2026-08-07

DROP TRIGGER IF EXISTS trg_enforce_booking_status_transition ON local_service.bookings;
CREATE TRIGGER trg_enforce_booking_status_transition
    AFTER INSERT OR UPDATE ON local_service.bookings
    FOR EACH ROW
    EXECUTE FUNCTION local_service.enforce_booking_status_transition();
