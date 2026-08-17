import { createServiceClient } from "./database.ts";
import type { AuditRecord, AuditStore, QueryFilters } from "./vendor/audit-log/core/types.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;
const TABLE = "audit_logs";

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown> | null;
  timestamp: string;
};

function rowToRecord(row: AuditLogRow): AuditRecord {
  const record: AuditRecord = {
    id: row.id,
    actor: { type: row.actor_type, ...(row.actor_id !== null ? { id: row.actor_id } : {}) },
    action: row.action,
    entity: { type: row.entity_type, id: row.entity_id },
    timestamp: row.timestamp,
  };
  if (row.before !== null) record.before = row.before;
  if (row.after !== null) record.after = row.after;
  if (row.metadata !== null) record.metadata = row.metadata;
  return record;
}

export class SupabaseAuditStore implements AuditStore {
  constructor(private supabase: ReturnType<typeof createServiceClient>) {}

  async append(record: AuditRecord): Promise<void> {
    const { error } = await this.supabase.from(TABLE).insert({
      id: record.id,
      actor_id: record.actor.id ?? null,
      actor_type: record.actor.type,
      action: record.action,
      entity_type: record.entity.type,
      entity_id: record.entity.id,
      before: record.before ?? null,
      after: record.after ?? null,
      metadata: record.metadata ?? null,
      timestamp: record.timestamp,
    });
    if (error) throw new Error(`audit_logs insert failed: ${error.message}`);
  }

  async query(filters: QueryFilters): Promise<{ records: AuditRecord[]; total: number }> {
    const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = filters.offset ?? 0;

    let q = this.supabase.from(TABLE).select("*", { count: "exact" });
    if (filters.actor?.id !== undefined) q = q.eq("actor_id", filters.actor.id);
    if (filters.actor?.type !== undefined) q = q.eq("actor_type", filters.actor.type);
    if (filters.action !== undefined) q = q.eq("action", filters.action);
    if (filters.entity?.type !== undefined) q = q.eq("entity_type", filters.entity.type);
    if (filters.entity?.id !== undefined) q = q.eq("entity_id", filters.entity.id);
    if (filters.dateRange?.from !== undefined) q = q.gte("timestamp", filters.dateRange.from);
    if (filters.dateRange?.to !== undefined) q = q.lte("timestamp", filters.dateRange.to);

    const { data, error, count } = await q.order("timestamp", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(`audit_logs query failed: ${error.message}`);

    return { records: (data ?? []).map(rowToRecord), total: count ?? 0 };
  }
}
