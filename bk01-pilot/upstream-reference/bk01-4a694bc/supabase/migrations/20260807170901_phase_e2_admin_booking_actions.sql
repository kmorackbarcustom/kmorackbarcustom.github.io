-- Phase E2: authenticated shop-member booking actions.
-- Status history is recorded by trg_enforce_booking_status_transition.

-- Authenticated users may read tenant-scoped bookings through RLS, but all
-- booking mutations must go through guarded RPCs instead of direct table writes.
GRANT SELECT ON TABLE local_service.bookings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.bookings FROM authenticated;

DROP POLICY IF EXISTS "Members view own shop" ON local_service.shops;
CREATE POLICY "Members view own shop"
    ON local_service.shops
    FOR SELECT
    TO authenticated
    USING (local_service.is_shop_member(id));

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

REVOKE ALL ON FUNCTION local_service.approve_booking_deposit(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION local_service.approve_booking_deposit(UUID) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.approve_booking_deposit(UUID) TO authenticated;

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

REVOKE ALL ON FUNCTION local_service.cancel_booking(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION local_service.cancel_booking(UUID, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION local_service.cancel_booking(UUID, TEXT) TO authenticated;
