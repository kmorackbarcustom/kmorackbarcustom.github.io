-- baseline คอลัมน์/constraint/index ของ bookings, holidays, production_allocations, orders

-- ==== columns public.bookings ====
CREATE TABLE public.bookings (
  id integer NOT NULL DEFAULT nextval('bookings_id_seq'::regclass),
  job_id text,
  source text,
  customer_name text,
  phone text,
  line_uid text,
  brand text,
  model text,
  product text,
  color text,
  price numeric,
  deposit numeric,
  appointment_date date,
  pickup_date date,
  queue_status text DEFAULT 'รอตรวจสอบ'::text,
  production_status text DEFAULT 'รอเริ่มงาน'::text,
  note text,
  event_id text,
  notified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  deposit_paid boolean DEFAULT false,
  deposit_paid_at timestamp with time zone,
  total_amount numeric(10,2) DEFAULT 0,
  total_paid boolean DEFAULT false,
  total_paid_at timestamp with time zone,
  customer_id uuid,
  updated_at timestamp with time zone DEFAULT now(),
  images text[] DEFAULT '{}'::text[],
  assigned_mechanic_username text,
  last_followup_at timestamp with time zone,
  followup_count integer DEFAULT 0,
  cart_meta jsonb,
  estimated_total numeric,
  source_page text
);

-- ==== columns public.holidays ====
CREATE TABLE public.holidays (
  id integer NOT NULL DEFAULT nextval('holidays_id_seq'::regclass),
  date date NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now()
);

-- ==== columns public.orders ====
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  customer_name text,
  unit numeric,
  production_days integer,
  start_date date,
  due_date date,
  status text DEFAULT 'pending'::text,
  line_user_id text,
  line_linked_at timestamp with time zone,
  priority text DEFAULT 'normal'::text,
  remaining_unit numeric,
  order_id text,
  contact text,
  channel text,
  brand text,
  model text,
  items text[],
  payment_type text,
  shopee_order_id text,
  shopee_deadline date,
  color text,
  delivery_type text,
  delivery_address text,
  assigned_mechanic_username text,
  last_followup_at timestamp with time zone,
  followup_count integer DEFAULT 0,
  note text,
  cart_meta jsonb,
  estimated_total numeric,
  source_page text
);

-- ==== columns public.production_allocations ====
CREATE TABLE public.production_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  work_date date NOT NULL,
  units numeric(6,2) NOT NULL,
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ==== constraint public.bookings bookings_customer_id_fkey ====
ALTER TABLE public.bookings ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ==== constraint public.bookings bookings_job_id_key ====
ALTER TABLE public.bookings ADD CONSTRAINT bookings_job_id_key UNIQUE (job_id);

-- ==== constraint public.bookings bookings_pkey ====
ALTER TABLE public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

-- ==== constraint public.holidays holidays_date_key ====
ALTER TABLE public.holidays ADD CONSTRAINT holidays_date_key UNIQUE (date);

-- ==== constraint public.holidays holidays_pkey ====
ALTER TABLE public.holidays ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);

-- ==== constraint public.orders orders_order_id_key ====
ALTER TABLE public.orders ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);

-- ==== constraint public.orders orders_pkey ====
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

-- ==== constraint public.production_allocations production_allocations_order_id_fkey ====
ALTER TABLE public.production_allocations ADD CONSTRAINT production_allocations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- ==== constraint public.production_allocations production_allocations_order_id_work_date_key ====
ALTER TABLE public.production_allocations ADD CONSTRAINT production_allocations_order_id_work_date_key UNIQUE (order_id, work_date);

-- ==== constraint public.production_allocations production_allocations_pkey ====
ALTER TABLE public.production_allocations ADD CONSTRAINT production_allocations_pkey PRIMARY KEY (id);

-- ==== constraint public.production_allocations production_allocations_source_check ====
ALTER TABLE public.production_allocations ADD CONSTRAINT production_allocations_source_check CHECK ((source = ANY (ARRAY['shopee'::text, 'customer'::text])));

-- ==== constraint public.production_allocations production_allocations_units_check ====
ALTER TABLE public.production_allocations ADD CONSTRAINT production_allocations_units_check CHECK ((units > (0)::numeric));

-- ==== index public.bookings bookings_job_id_key ====
CREATE UNIQUE INDEX bookings_job_id_key ON public.bookings USING btree (job_id);

-- ==== index public.bookings bookings_pkey ====
CREATE UNIQUE INDEX bookings_pkey ON public.bookings USING btree (id);

-- ==== index public.bookings idx_bookings_appointment_date ====
CREATE INDEX idx_bookings_appointment_date ON public.bookings USING btree (appointment_date);

-- ==== index public.bookings idx_bookings_dates ====
CREATE INDEX idx_bookings_dates ON public.bookings USING btree (appointment_date, pickup_date);

-- ==== index public.bookings idx_bookings_followup_due ====
CREATE INDEX idx_bookings_followup_due ON public.bookings USING btree (appointment_date, last_followup_at);

-- ==== index public.bookings idx_bookings_job_id ====
CREATE INDEX idx_bookings_job_id ON public.bookings USING btree (job_id);

-- ==== index public.bookings idx_bookings_pickup_date ====
CREATE INDEX idx_bookings_pickup_date ON public.bookings USING btree (pickup_date);

-- ==== index public.bookings idx_bookings_production_status ====
CREATE INDEX idx_bookings_production_status ON public.bookings USING btree (production_status);

-- ==== index public.bookings idx_bookings_queue_status ====
CREATE INDEX idx_bookings_queue_status ON public.bookings USING btree (queue_status);

-- ==== index public.holidays holidays_date_key ====
CREATE UNIQUE INDEX holidays_date_key ON public.holidays USING btree (date);

-- ==== index public.holidays holidays_pkey ====
CREATE UNIQUE INDEX holidays_pkey ON public.holidays USING btree (id);

-- ==== index public.orders idx_orders_followup_due ====
CREATE INDEX idx_orders_followup_due ON public.orders USING btree (due_date, last_followup_at);

-- ==== index public.orders orders_order_id_key ====
CREATE UNIQUE INDEX orders_order_id_key ON public.orders USING btree (order_id);

-- ==== index public.orders orders_pkey ====
CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);

-- ==== index public.production_allocations production_allocations_order_id_idx ====
CREATE INDEX production_allocations_order_id_idx ON public.production_allocations USING btree (order_id);

-- ==== index public.production_allocations production_allocations_order_id_work_date_key ====
CREATE UNIQUE INDEX production_allocations_order_id_work_date_key ON public.production_allocations USING btree (order_id, work_date);

-- ==== index public.production_allocations production_allocations_pkey ====
CREATE UNIQUE INDEX production_allocations_pkey ON public.production_allocations USING btree (id);

-- ==== index public.production_allocations production_allocations_work_date_idx ====
CREATE INDEX production_allocations_work_date_idx ON public.production_allocations USING btree (work_date);
