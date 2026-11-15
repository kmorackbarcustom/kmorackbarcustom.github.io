ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bookings, public.holidays TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bookings_id_seq, public.holidays_id_seq TO anon, authenticated, service_role;
CREATE POLICY "anon can insert bookings" ON public.bookings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can read holidays" ON public.holidays FOR SELECT TO anon USING (true);
