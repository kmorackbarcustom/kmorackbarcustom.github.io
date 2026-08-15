import { createServiceClient } from "./database.ts";
import type { SessionStore, UserSession } from "./vendor/line-oa-ai-module/core/types.ts";

export class PostgresSessionStore implements SessionStore {
  constructor(
    private supabase: ReturnType<typeof createServiceClient>,
    // ponytail: mirrors StateManager's in-memory default so Postgres sessions expire the same way; bump if 30min is too short for real conversations
    private ttlMs = 1000 * 60 * 30
  ) {}

  async get(userId: string): Promise<UserSession | null> {
    const { data, error } = await this.supabase
      .from("line_chat_sessions")
      .select("user_id, state, context_data, history, last_interaction")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[line-session-store] get failed", error);
      return null;
    }

    if (!data) return null;

    const lastInteraction = new Date(data.last_interaction).getTime();
    if (Date.now() - lastInteraction > this.ttlMs) return null;

    return {
      userId: data.user_id,
      state: data.state,
      contextData: data.context_data ?? {},
      history: data.history ?? [],
      lastInteraction,
    };
  }

  async set(userId: string, session: UserSession, _ttlMs?: number): Promise<void> {
    const { error } = await this.supabase.from("line_chat_sessions").upsert({
      user_id: userId,
      state: session.state,
      context_data: session.contextData ?? {},
      history: session.history ?? [],
      last_interaction: new Date(session.lastInteraction ?? Date.now()).toISOString(),
    });

    if (error) console.error("[line-session-store] set failed", error);
  }

  async delete(userId: string): Promise<void> {
    const { error } = await this.supabase.from("line_chat_sessions").delete().eq("user_id", userId);
    if (error) console.error("[line-session-store] delete failed", error);
  }
}
