import { requiredEnv } from "./database.ts";

type ChatHistoryItem = { role: string; content: string };
type ChatInput = { userMessage: string; history: ChatHistoryItem[]; systemPrompt: string };
type ChatOutput = { reply: string; provider: "ollama" | "gemini" };

// deno-lint-ignore no-explicit-any
type OllamaMessage = Record<string, any>;
export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;
type AgentInput = ChatInput & { tools: ToolDef[]; runTool: ToolRunner; maxRounds?: number };

// deepseek-v4-flash:0731-cloud is Hermes' default across the workspace and beat the other
// Ollama Cloud tool-calling models on the KMO grounding eval (docs/agent-upgrade/phase2-model-eval.md):
// clean on hallucination bait, correct tool discipline, and - unlike gemma4 - no token-loop history.
// If this dated tag is ever retired on Ollama Cloud, the Gemini fallback takes over; swap to a
// current tag here.
const OLLAMA_MODEL = "deepseek-v4-flash:0731-cloud";
const OLLAMA_URL = "https://ollama.com/v1/chat/completions";
export const PROVIDER_TIMEOUT_MS = 9000;
// Agent loop can fan out to a few tool calls per round, so give it more headroom than a single shot.
const AGENT_TIMEOUT_MS = 20000;

async function ollamaChat(messages: OllamaMessage[], tools?: ToolDef[], timeoutMs = PROVIDER_TIMEOUT_MS): Promise<OllamaMessage> {
  const apiKey = requiredEnv("OLLAMA_API_KEY");
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama Cloud error (${response.status}): ${text}`);
  }
  const json = await response.json();
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("Ollama Cloud returned no message");
  return message;
}

function baseMessages(input: ChatInput): OllamaMessage[] {
  return [
    { role: "system", content: input.systemPrompt },
    ...input.history.map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
    { role: "user", content: input.userMessage },
  ];
}

// gemma4 (and small models generally) can fall into token-looping on long/complex context and
// emit "a a a a ..." style garbage that never recovers. Catch it and let the caller fall back.
// same char x10+ ("aaaaaaaaaa"), or a 2-20 char chunk repeated x6+ ("a a a a a a")
export function isDegenerateText(text: string): boolean {
  return /(.)\1{9,}/s.test(text) || /(.{2,20})\1{5,}/s.test(text);
}

function assertNotDegenerate(text: string): void {
  if (isDegenerateText(text)) throw new Error("model output looks degenerate (token loop)");
}

async function callOllamaCloud(input: ChatInput): Promise<string> {
  const message = await ollamaChat(baseMessages(input));
  const reply = message.content;
  if (!reply) throw new Error("Ollama Cloud returned no content");
  assertNotDegenerate(reply);
  return reply.trim();
}

async function callGeminiFallback(input: ChatInput): Promise<string> {
  const { generateLineReplyGemini } = await import("./gemini.ts");
  return generateLineReplyGemini(input);
}

export async function generateLineReply(input: ChatInput): Promise<ChatOutput> {
  try {
    return { reply: await callOllamaCloud(input), provider: "ollama" };
  } catch (error) {
    console.error("[ai] Ollama Cloud failed, trying fallback", error);
    try {
      return { reply: await callGeminiFallback(input), provider: "gemini" };
    } catch (fallbackError) {
      console.error("[ai] Gemini fallback also failed (or not configured)", fallbackError);
      throw error;
    }
  }
}

/**
 * Tool-calling agent loop. The model decides which read-only tools to call; we execute them and
 * feed results back. Bounded to `maxRounds` (default 3) model calls total - on the final round we
 * drop the `tools` param so the model is forced to produce a text answer with whatever it has.
 * If Ollama fails at any point, falls back to a single-shot Gemini reply (text-only, no tools).
 */
export async function generateLineReplyAgent(input: AgentInput): Promise<ChatOutput> {
  const maxRounds = input.maxRounds ?? 3;
  const messages = baseMessages(input);
  try {
    for (let round = 0; round < maxRounds; round++) {
      const offerTools = round < maxRounds - 1;
      const message = await ollamaChat(messages, offerTools ? input.tools : undefined, AGENT_TIMEOUT_MS);
      const toolCalls = offerTools ? (message.tool_calls ?? []) : [];

      if (toolCalls.length === 0) {
        const reply = (message.content ?? "").trim();
        if (!reply) throw new Error("Ollama Cloud returned empty content");
        assertNotDegenerate(reply);
        return { reply, provider: "ollama" };
      }

      messages.push(message);
      for (const call of toolCalls) {
        const name = call.function?.name ?? "";
        let result: string;
        try {
          const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          result = await input.runTool(name, args);
        } catch (toolError) {
          console.error("[ai-agent] tool failed", name, toolError);
          result = "ดึงข้อมูลส่วนนี้ไม่สำเร็จ ไม่มีข้อมูลให้ตอบ";
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    // Shouldn't reach here (last round has no tools -> returns above), but guard anyway.
    throw new Error("agent loop exhausted without a text reply");
  } catch (error) {
    console.error("[ai] agent loop failed, trying Gemini fallback", error);
    return { reply: await callGeminiFallback(input), provider: "gemini" };
  }
}
