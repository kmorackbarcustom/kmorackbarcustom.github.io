import { createServiceClient } from "./database.ts";
import type {
  ChatMessageHistory,
  SessionStore,
  UserSession,
} from "./vendor/line-oa-ai-module/core/types.ts";

export class PostgresSessionStore implements SessionStore {
  constructor(
    private supabase: ReturnType<typeof createServiceClient>,
    // ponytail: fallback only - line-webhook normally passes settings.session_ttl_hours (admin-editable) explicitly
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

  // Appends via the line_append_chat_history RPC, which does the array-append and trim-to-maxHistory
  // in one SQL statement server-side - no get-then-set gap for concurrent callers to race through.
  async appendHistoryAtomic(
    userId: string,
    message: ChatMessageHistory,
    maxHistory: number,
  ): Promise<UserSession> {
    const { data, error } = await this.supabase.rpc("line_append_chat_history", {
      p_user_id: userId,
      p_message: message,
      p_max_history: maxHistory,
    });
    if (error || !data) {
      console.error("[line-session-store] appendHistoryAtomic failed", error);
      throw error ?? new Error("line_append_chat_history returned no row");
    }
    return {
      userId: data.user_id,
      state: data.state,
      contextData: data.context_data ?? {},
      history: data.history ?? [],
      lastInteraction: new Date(data.last_interaction).getTime(),
    };
  }
}
