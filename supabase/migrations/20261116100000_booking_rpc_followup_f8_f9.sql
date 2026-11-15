DELETE FROM public.booking_requests r
WHERE NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.job_id = r.job_id);

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_requests'::regclass
      AND conname = 'booking_requests_job_id_fkey'
  ) THEN
    ALTER TABLE public.booking_requests
      ADD CONSTRAINT booking_requests_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.bookings(job_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END
$fk$;

CREATE OR REPLACE FUNCTION public.generate_job_id(p_platform text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN public.kmo_next_job_id(p_platform);
END
$function$;
