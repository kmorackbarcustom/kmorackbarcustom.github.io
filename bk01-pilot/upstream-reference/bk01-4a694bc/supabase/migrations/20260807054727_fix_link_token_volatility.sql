-- Fix: generate_link_token() calls random() but was marked IMMUTABLE, which
-- incorrectly tells Postgres the function always returns the same output for
-- the same (nonexistent) inputs. This let the planner cache/reuse a single
-- generated token across calls, producing duplicate link_tokens across
-- different bookings (observed: two bookings created back-to-back both got
-- "Q929"). Not a security issue on its own (the webhook route looks up by
-- booking_code first, which is guaranteed unique, and only checks link_token
-- as a secondary match), but it defeats the point of a per-booking token.
-- Date: 2026-08-07

CREATE OR REPLACE FUNCTION local_service.generate_link_token()
RETURNS TEXT AS $$
DECLARE
    v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_token TEXT := '';
    v_i INT;
BEGIN
    FOR v_i IN 1..4 LOOP
        v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    RETURN v_token;
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, local_service;
