import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PostgresSessionStore } from "./line-session-store.ts";

function fakeSupabase(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  } as any;
}

Deno.test("get() returns null for a session older than ttlMs", async () => {
  const staleRow = {
    user_id: "u1",
    state: "IDLE",
    context_data: {},
    history: [],
    last_interaction: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
  };
  const store = new PostgresSessionStore(
    fakeSupabase(staleRow),
    30 * 60 * 1000,
  ); // 30min ttl
  assertEquals(await store.get("u1"), null);
});

Deno.test("get() returns the session when within ttlMs", async () => {
  const freshRow = {
    user_id: "u1",
    state: "IDLE",
    context_data: {},
    history: [],
    last_interaction: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5min ago
  };
  const store = new PostgresSessionStore(
    fakeSupabase(freshRow),
    30 * 60 * 1000,
  );
  const session = await store.get("u1");
  assertEquals(session?.userId, "u1");
});

Deno.test("get() isolates persisted context_data by LINE user id", async () => {
  const rows: Record<string, Record<string, unknown>> = {
    userA: {
      user_id: "userA",
      state: "RESCHEDULE",
      context_data: { pending_action: "reschedule", original_date: "วันเสาร์" },
      history: [],
      last_interaction: new Date().toISOString(),
    },
    userB: {
      user_id: "userB",
      state: "IDLE",
      context_data: {},
      history: [],
      last_interaction: new Date().toISOString(),
    },
  };
  const supabase = {
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: () =>
            Promise.resolve({ data: rows[userId] ?? null, error: null }),
        }),
      }),
    }),
  } as any;
  const store = new PostgresSessionStore(supabase, 30 * 60 * 1000);
  assertEquals(
    (await store.get("userA"))?.contextData.pending_action,
    "reschedule",
  );
  assertEquals(
    (await store.get("userB"))?.contextData.pending_action,
    undefined,
  );
});
