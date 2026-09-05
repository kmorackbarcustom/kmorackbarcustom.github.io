import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MemorySessionStore, StateManager } from "./state-manager.ts";
import type { ChatMessageHistory, SessionStore, UserSession } from "./types.ts";

// A store WITH appendHistoryAtomic - StateManager.appendHistory must delegate to it directly and
// never fall back to its own get-then-set, since that's exactly the read-modify-write gap that
// let concurrent callers for the same userId clobber each other's history (the LINE image-burst
// bug this method exists to fix).
function makeAtomicStore() {
  let getCalls = 0;
  let setCalls = 0;
  let atomicCalls = 0;
  const result: UserSession = {
    userId: "u1",
    state: "IDLE",
    contextData: {},
    history: [{ role: "user", content: "from atomic rpc", timestamp: 1 }],
    lastInteraction: 1,
  };
  const store: SessionStore = {
    get: async () => {
      getCalls++;
      return null;
    },
    set: async () => {
      setCalls++;
    },
    delete: async () => undefined,
    appendHistoryAtomic: async () => {
      atomicCalls++;
      return result;
    },
  };
  return { store, getCalls: () => getCalls, setCalls: () => setCalls, atomicCalls: () => atomicCalls, result };
}

Deno.test("appendHistory delegates to appendHistoryAtomic when the store implements it", async () => {
  const t = makeAtomicStore();
  const manager = new StateManager(t.store);
  const message: ChatMessageHistory = { role: "user", content: "hi", timestamp: 1 };
  const session = await manager.appendHistory("u1", message, 40);

  assertEquals(t.atomicCalls(), 1);
  assertEquals(t.getCalls(), 0, "must not read the session itself before an atomic append");
  assertEquals(t.setCalls(), 0, "must not overwrite the whole session after an atomic append");
  assertEquals(session, t.result);
});

Deno.test("appendHistory falls back to get-then-set for a store without appendHistoryAtomic (MemorySessionStore)", async () => {
  const store = new MemorySessionStore();
  const manager = new StateManager(store);
  await manager.appendHistory("u1", { role: "user", content: "first", timestamp: 1 });
  const session = await manager.appendHistory("u1", { role: "assistant", content: "second", timestamp: 2 });

  assertEquals(session.history.map((h) => h.content), ["first", "second"]);
});

Deno.test("fallback path still trims to maxHistory", async () => {
  const store = new MemorySessionStore();
  const manager = new StateManager(store);
  for (let i = 0; i < 5; i++) {
    await manager.appendHistory("u1", { role: "user", content: `m${i}`, timestamp: i }, 3);
  }
  const session = await manager.getSession("u1");
  assertEquals(session.history.map((h) => h.content), ["m2", "m3", "m4"]);
});
