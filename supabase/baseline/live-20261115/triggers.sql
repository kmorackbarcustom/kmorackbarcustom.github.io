-- baseline trigger บน 4 ตาราง (pg_get_triggerdef)

-- ==== trigger public.bookings bookings_updated_at ====
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- enabled=O

-- ==== trigger public.bookings on_booking_insert ====
CREATE TRIGGER on_booking_insert AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_telegram_booking();
-- enabled=O

-- ==== trigger public.bookings trg_sync_customer_from_booking ====
CREATE TRIGGER trg_sync_customer_from_booking AFTER INSERT OR UPDATE OF line_uid, customer_name, phone ON public.bookings FOR EACH ROW WHEN (((new.line_uid IS NOT NULL) AND (new.line_uid <> ''::text))) EXECUTE FUNCTION kmo_sync_customer_from_booking();
-- enabled=O

-- ==== trigger public.orders on_order_insert_telegram ====
CREATE TRIGGER on_order_insert_telegram AFTER INSERT ON public.orders FOR EACH ROW WHEN (((new.order_id IS NOT NULL) AND (new.start_date IS NOT NULL) AND (new.due_date IS NOT NULL))) EXECUTE FUNCTION notify_telegram_order();
-- enabled=O

-- ==== trigger public.orders on_order_ready_telegram ====
CREATE TRIGGER on_order_ready_telegram AFTER UPDATE OF order_id, start_date, due_date ON public.orders FOR EACH ROW WHEN (((new.order_id IS NOT NULL) AND (new.start_date IS NOT NULL) AND (new.due_date IS NOT NULL) AND ((old.order_id IS NULL) OR (old.due_date IS NULL) OR (old.start_date IS NULL)))) EXECUTE FUNCTION notify_telegram_order();
-- enabled=O

-- ==== trigger public.orders orders_updated_at ====
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- enabled=O
