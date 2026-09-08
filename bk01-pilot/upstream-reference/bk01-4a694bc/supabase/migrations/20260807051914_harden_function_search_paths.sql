-- Harden SECURITY DEFINER functions against search_path hijacking
-- Date: 2026-08-07
-- Fixes: Supabase advisor WARN "function_search_path_mutable" on 6 functions
-- created by earlier migrations without a pinned search_path.

ALTER FUNCTION local_service.is_shop_member(UUID) SET search_path = pg_catalog, local_service;
ALTER FUNCTION local_service.generate_booking_code() SET search_path = pg_catalog, local_service;
ALTER FUNCTION local_service.generate_link_token() SET search_path = pg_catalog, local_service;
ALTER FUNCTION local_service.enforce_booking_status_transition() SET search_path = pg_catalog, local_service;
ALTER FUNCTION local_service.extend_booking_hold(UUID) SET search_path = pg_catalog, local_service;
ALTER FUNCTION local_service.reject_deposit_slip(UUID, TEXT) SET search_path = pg_catalog, local_service;
