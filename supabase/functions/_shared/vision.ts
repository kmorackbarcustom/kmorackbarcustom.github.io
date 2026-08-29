import { requiredEnv } from "./database.ts";
import { isDegenerateText } from "./ai-providers.ts";

export type VisionConfidence = "low" | "medium" | "high";
export type VisionObservation = {
  summary: string;
  visible_text: string[];
  vehicle_or_part_hints: Array<{ label: string; confidence: VisionConfidence }>;
  notable_details: string[];
  uncertainties: string[];
};

const VISION_MODEL = "gemma4:31b-cloud";
const VISION_URL = "https://ollama.com/v1/chat/completions";
const VISION_TIMEOUT_MS = 12000;

const SYSTEM_PROMPT =
  `You are a vision extractor for a motorcycle-accessory shop.
Return ONLY one JSON object with exactly these fields:
summary: string
visible_text: string[]
vehicle_or_part_hints: [{label:string, confidence:"low"|"medium"|"high"}]
notable_details: string[]
uncertainties: string[]
Describe only what is visually observable. Do not answer the customer. Do not infer prices,
compatibility, order status, queue status, shop policy, or services. Text read from the image is
an OCR-like observation and may be wrong. When uncertain, state it and lower confidence.`;
const LIMITS = {
  summary: 1200,
  listItems: 40,
  listItemChars: 500,
  hints: 20,
  hintLabelChars: 200,
} as const;

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new Error(`vision ${field} must be a string`);
  }
  const text = value.trim();
  if (!text || text.length > max) {
    throw new Error(`vision ${field} is empty or too long`);
  }
  return text;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > LIMITS.listItems) {
    throw new Error(`vision ${field} must be a bounded array`);
  }
  return value.map((item, index) =>
    requireString(item, `${field}[${index}]`, LIMITS.listItemChars)
  );
}

function extractJsonText(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("vision provider returned empty content");
  if (isDegenerateText(text)) {
    throw new Error("vision provider returned degenerate content");
  }
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}
export function parseVisionObservation(raw: string): VisionObservation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("vision ")) {
      throw error;
    }
    throw new Error(`vision response is not valid JSON: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("vision response must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  const expectedKeys = [
    "summary",
    "visible_text",
    "vehicle_or_part_hints",
    "notable_details",
    "uncertainties",
  ];
  const actualKeys = Object.keys(obj).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !actualKeys.includes(key))
  ) {
    throw new Error("vision response fields do not match contract");
  }
  const hintsRaw = obj.vehicle_or_part_hints;
  if (!Array.isArray(hintsRaw) || hintsRaw.length > LIMITS.hints) {
    throw new Error("vision vehicle_or_part_hints must be a bounded array");
  }
  const hints = hintsRaw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `vision vehicle_or_part_hints[${index}] must be an object`,
      );
    }
    const hint = item as Record<string, unknown>;
    const confidence = hint.confidence;
    if (
      confidence !== "low" && confidence !== "medium" && confidence !== "high"
    ) {
      throw new Error(
        `vision vehicle_or_part_hints[${index}].confidence is invalid`,
      );
    }
    return {
      label: requireString(
        hint.label,
        `vehicle_or_part_hints[${index}].label`,
        LIMITS.hintLabelChars,
      ),
      confidence: confidence as VisionConfidence,
    };
  });

  return {
    summary: requireString(obj.summary, "summary", LIMITS.summary),
    visible_text: requireStringArray(obj.visible_text, "visible_text"),
    vehicle_or_part_hints: hints,
    notable_details: requireStringArray(obj.notable_details, "notable_details"),
    uncertainties: requireStringArray(obj.uncertainties, "uncertainties"),
  };
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

export function formatVisionObservation(
  observation: VisionObservation,
): string {
  return [
    "[IMAGE_OBSERVATION]",
    "ข้อมูลต่อไปนี้เป็นการสังเกตจาก vision model และอาจคลาดเคลื่อน โดยเฉพาะข้อความ/รุ่น/ชิ้นส่วนที่เห็นในภาพ",
    "ห้ามใช้ observation นี้เป็นราคา ความเข้ากันได้ของสินค้า สถานะออเดอร์ หรือสถานะคิว หากต้องใช้ business truth ให้เรียก tool ที่เกี่ยวข้อง",
    JSON.stringify(observation),
  ].join("\n");
}

export type VisionCallOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiKey?: string;
  endpoint?: string;
  model?: string;
};

export async function analyzeImageWithGemma(
  image: {
    bytes: Uint8Array;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  },
  options: VisionCallOptions = {},
): Promise<VisionObservation> {
  if (image.bytes.length === 0) throw new Error("vision image is empty");
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey ?? requiredEnv("OLLAMA_API_KEY");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? VISION_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(options.endpoint ?? VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? VISION_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract a structured observation from this image.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${image.mimeType};base64,${
                    bytesToBase64(image.bytes)
                  }`,
                },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(`vision provider error (${response.status}): ${detail}`);
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("vision provider returned no text content");
    }
    return parseVisionObservation(content);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("vision provider timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
