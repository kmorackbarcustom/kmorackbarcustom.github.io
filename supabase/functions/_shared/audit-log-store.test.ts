import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseAuditStore } from "./audit-log-store.ts";

// ---------------------------------------------------------------------------
// Test helpers: hand-written fakes that record the builder-chain calls,
// modelled on the style of line-session-store.test.ts but extended so we can
// assert *which* methods were called with *which* args.
// ---------------------------------------------------------------------------

/** Records every builder method call as a flat array of {method, args}. */
type CallLog = Array<{ method: string; args: unknown[] }>;

/**
 * A query-builder node that is both chainable (sync methods return self)
 * and thenable (await resolves to the canned result). Used for the
 * select().eq().order().range() chain.
 */
function makeChainNode(
  calls: CallLog,
  resolve: () => Promise<unknown>,
): Record<string, unknown> {
  const node: Record<string, unknown> = {};

  const syncMethods = ["eq", "gte", "lte", "order", "range"];
  for (const m of syncMethods) {
    node[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return node;
    };
  }

  // Thenable so `await` resolves to the canned query result.
  node["then"] = (resolveFn: (v: unknown) => unknown) =>
    resolve().then(resolveFn);

  return node;
}

/** Builds a fake supabase client. opts drive the canned results. */
function fakeSupabase(opts: {
  insertError?: string;
  queryResult?: { data: unknown[]; error?: { message: string }; count?: number };
}) {
  const calls: CallLog = [];

  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });

      const builder: Record<string, unknown> = {};

      // insert(row) — returns a thenable resolving to {data, error}.
      builder["insert"] = (...args: unknown[]) => {
        calls.push({ method: "insert", args });
        const insertResult = opts.insertError
          ? { data: null, error: { message: opts.insertError } }
          : { data: null, error: null };
        return {
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(insertResult).then(resolve),
        };
      };

      // select(...) — returns a chainable + thenable node resolving the query.
      builder["select"] = (...args: unknown[]) => {
        calls.push({ method: "select", args });
        const queryResult = opts.queryResult ?? { data: [], error: null, count: 0 };
        return makeChainNode(calls, () => Promise.resolve(queryResult));
      };

      return builder;
    },
    _calls: calls,
  };
  return client;
}

/** Convenience accessor for the call log on the fake client. */
function callsOf(client: ReturnType<typeof fakeSupabase>): CallLog {
  return (client as any)._calls as CallLog;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("append() inserts the correct row shape, mapping actor.id=null when absent", async () => {
  const client = fakeSupabase({});
  const store = new SupabaseAuditStore(client as any);

  const record = {
    id: "rec_1",
    actor: { type: "system" }, // no id
    action: "user.created",
    entity: { type: "user_profile", id: "usr_42" },
    timestamp: "2026-08-17T07:00:00.000Z",
    // before / after / metadata intentionally omitted
  };

  await store.append(record as any);

  const calls = callsOf(client);
  const insertCall = calls.find((c) => c.method === "insert");
  assertEquals(insertCall !== undefined, true);

  const insertedRow = insertCall!.args[0] as Record<string, unknown>;
  assertEquals(insertedRow.id, "rec_1");
  assertEquals(insertedRow.actor_id, null);
  assertEquals(insertedRow.actor_type, "system");
  assertEquals(insertedRow.action, "user.created");
  assertEquals(insertedRow.entity_type, "user_profile");
  assertEquals(insertedRow.entity_id, "usr_42");
  assertEquals(insertedRow.before, null);
  assertEquals(insertedRow.after, null);
  assertEquals(insertedRow.metadata, null);
  assertEquals(insertedRow.timestamp, "2026-08-17T07:00:00.000Z");
});

Deno.test("append() maps actor.id, before, after, metadata when present", async () => {
  const client = fakeSupabase({});
  const store = new SupabaseAuditStore(client as any);

  const record = {
    id: "rec_2",
    actor: { id: "usr_99", type: "admin" },
    action: "status.changed",
    entity: { type: "ticket", id: "TKT-1002" },
    before: { status: "open" },
    after: { status: "closed" },
    metadata: { source: "web" },
    timestamp: "2026-08-17T08:00:00.000Z",
  };

  await store.append(record as any);

  const calls = callsOf(client);
  const insertCall = calls.find((c) => c.method === "insert")!;
  const row = insertCall.args[0] as Record<string, unknown>;
  assertEquals(row.actor_id, "usr_99");
  assertEquals(row.actor_type, "admin");
  assertEquals(row.before, { status: "open" });
  assertEquals(row.after, { status: "closed" });
  assertEquals(row.metadata, { source: "web" });
});

Deno.test("append() throws when insert returns an error", async () => {
  const client = fakeSupabase({ insertError: "permission denied" });
  const store = new SupabaseAuditStore(client as any);

  const record = {
    id: "rec_err",
    actor: { type: "system" },
    action: "x",
    entity: { type: "y", id: "z" },
    timestamp: "2026-08-17T09:00:00.000Z",
  };

  await assertRejects(
    () => store.append(record as any),
    Error,
    "audit_logs insert failed: permission denied",
  );
});

Deno.test("query() applies .eq() only for filter fields that are present", async () => {
  const client = fakeSupabase({ queryResult: { data: [], count: 0 } });
  const store = new SupabaseAuditStore(client as any);

  // Only entity.id provided — no actor/action/entity.type/dateRange.
  await store.query({ entity: { id: "cust_1" } });

  const calls = callsOf(client);
  const eqCalls = calls.filter((c) => c.method === "eq").map((c) => c.args);

  // Exactly one eq call: ("entity_id", "cust_1")
  assertEquals(eqCalls, [["entity_id", "cust_1"]]);

  // Sanity: no eq for actor_type, actor_id, action, entity_type.
  const eqCols = eqCalls.map((a) => a[0]);
  assertEquals(eqCols.includes("actor_type"), false);
  assertEquals(eqCols.includes("actor_id"), false);
  assertEquals(eqCols.includes("action"), false);
  assertEquals(eqCols.includes("entity_type"), false);
});

Deno.test("query() applies all relevant .eq/.gte/.lte when every filter is provided", async () => {
  const client = fakeSupabase({ queryResult: { data: [], count: 0 } });
  const store = new SupabaseAuditStore(client as any);

  await store.query({
    actor: { id: "usr_1", type: "admin" },
    action: "status.changed",
    entity: { type: "ticket", id: "TKT-1" },
    dateRange: { from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T23:59:59.999Z" },
    limit: 10,
    offset: 5,
  });

  const calls = callsOf(client);
  const methodArgs = (m: string) =>
    calls.filter((c) => c.method === m).map((c) => c.args);

  assertEquals(methodArgs("eq"), [
    ["actor_id", "usr_1"],
    ["actor_type", "admin"],
    ["action", "status.changed"],
    ["entity_type", "ticket"],
    ["entity_id", "TKT-1"],
  ]);
  assertEquals(methodArgs("gte"), [["timestamp", "2026-01-01T00:00:00.000Z"]]);
  assertEquals(methodArgs("lte"), [["timestamp", "2026-12-31T23:59:59.999Z"]]);
  // order + range should be present
  assertEquals(calls.some((c) => c.method === "order"), true);
  const rangeCall = calls.find((c) => c.method === "range");
  assertEquals(rangeCall !== undefined, true);
  assertEquals(rangeCall!.args, [5, 5 + 10 - 1]);
});

Deno.test("query() maps rows back to AuditRecord shape, omitting null before/after/metadata keys", async () => {
  const rows = [
    {
      id: "r1",
      actor_id: "usr_1",
      actor_type: "admin",
      action: "status.changed",
      entity_type: "ticket",
      entity_id: "TKT-1",
      before: null,
      after: null,
      metadata: null,
      timestamp: "2026-08-17T10:00:00.000Z",
    },
    {
      id: "r2",
      actor_id: null,
      actor_type: "system",
      action: "user.created",
      entity_type: "user_profile",
      entity_id: "usr_42",
      before: { status: "open" },
      after: { status: "closed" },
      metadata: { source: "web" },
      timestamp: "2026-08-17T11:00:00.000Z",
    },
  ];

  const client = fakeSupabase({ queryResult: { data: rows, count: 2 } });
  const store = new SupabaseAuditStore(client as any);

  const { records, total } = await store.query({});

  assertEquals(total, 2);
  assertEquals(records.length, 2);

  // Row 1: all optional keys omitted entirely (not set to null).
  const r1 = records[0];
  assertEquals(r1.id, "r1");
  assertEquals(r1.actor, { type: "admin", id: "usr_1" });
  assertEquals(r1.action, "status.changed");
  assertEquals(r1.entity, { type: "ticket", id: "TKT-1" });
  assertEquals(r1.timestamp, "2026-08-17T10:00:00.000Z");
  assertEquals("before" in r1, false);
  assertEquals("after" in r1, false);
  assertEquals("metadata" in r1, false);

  // Row 2: optional keys present with their values.
  const r2 = records[1];
  assertEquals(r2.id, "r2");
  assertEquals(r2.actor, { type: "system" }); // actor_id null -> no id key
  assertEquals(r2.action, "user.created");
  assertEquals(r2.entity, { type: "user_profile", id: "usr_42" });
  assertEquals(r2.timestamp, "2026-08-17T11:00:00.000Z");
  assertEquals(r2.before, { status: "open" });
  assertEquals(r2.after, { status: "closed" });
  assertEquals(r2.metadata, { source: "web" });
});

Deno.test("query() uses default limit 50 when no limit is given", async () => {
  const client = fakeSupabase({ queryResult: { data: [], count: 0 } });
  const store = new SupabaseAuditStore(client as any);

  await store.query({});

  const rangeCall = callsOf(client).find((c) => c.method === "range");
  assertEquals(rangeCall !== undefined, true);
  // offset 0, limit 50 -> range(0, 49)
  assertEquals(rangeCall!.args, [0, 49]);
});

Deno.test("query() caps limit at MAX_LIMIT (1000)", async () => {
  const client = fakeSupabase({ queryResult: { data: [], count: 0 } });
  const store = new SupabaseAuditStore(client as any);

  await store.query({ limit: 5000, offset: 0 });

  const rangeCall = callsOf(client).find((c) => c.method === "range");
  assertEquals(rangeCall !== undefined, true);
  // Capped to 1000 -> range(0, 999)
  assertEquals(rangeCall!.args, [0, 999]);
});

Deno.test("query() throws when select returns an error", async () => {
  const client = fakeSupabase({
    queryResult: { data: [], error: { message: "column missing" }, count: 0 },
  });
  const store = new SupabaseAuditStore(client as any);

  await assertRejects(
    () => store.query({}),
    Error,
    "audit_logs query failed: column missing",
  );
});