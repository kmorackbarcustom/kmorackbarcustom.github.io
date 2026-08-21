import { requiredEnv } from "./database.ts";

type ChatHistoryItem = { role: string; content: string };
type ChatInput = { userMessage: string; history: ChatHistoryItem[]; systemPrompt: string };
type ChatOutput = { reply: string; provider: "ollama" | "gemini" };

const OLLAMA_MODEL = "gemma4:31b-cloud";
export const PROVIDER_TIMEOUT_MS = 9000;

async function callOllamaCloud(input: ChatInput): Promise<string> {
  const apiKey = requiredEnv("OLLAMA_API_KEY");
  const messages = [
    { role: "system", content: input.systemPrompt },
    ...input.history.map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
    { role: "user", content: input.userMessage },
  ];

  const response = await fetch("https://ollama.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama Cloud error (${response.status}): ${text}`);
  }

  const json = await response.json();
  const reply = json.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Ollama Cloud returned no content");
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
