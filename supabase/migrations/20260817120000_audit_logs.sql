-- Audit trail for staff actions with zero prior observability: pausing/resuming the AI bot for
-- a customer (staff-reply, telegram-webhook /pause /resume) and sending a manual reply on a
-- customer's behalf (staff-reply). Vendored from modules-hub/modules/audit-log (copy-and-own);
-- schema follows that module's AUDIT_LOG_DDL. Only ever accessed by edge functions via the
-- service-role key (createServiceClient()), same as every other table here.
create table if not exists public.audit_logs (
  id uuid primary key,
  actor_id text,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  metadata jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_actor on public.audit_logs (actor_type, actor_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_timestamp on public.audit_logs (timestamp desc);

alter table public.audit_logs enable row level security;

-- Append-only guarantee at the DB layer. The upstream module's own DDL only revokes from
-- PUBLIC, which does NOT restrict service_role on this project: information_schema.role_table_grants
-- shows anon/authenticated/service_role hold UPDATE/DELETE as direct grants here, independent of
-- PUBLIC (confirmed against the `customers` table). Revoke explicitly from all three so the
-- service-role key genuinely cannot mutate or delete audit history.
revoke update, delete on public.audit_logs from public, anon, authenticated, service_role;
