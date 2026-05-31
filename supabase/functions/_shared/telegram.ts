import { requiredEnv } from "./database.ts";
import { STATUS_LABELS } from "./constants.ts";

type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;

type TelegramSendMessageResult = {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number };
  };
  description?: string;
};

type TelegramWebhookInfoResult = {
  ok: boolean;
  result?: {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    allowed_updates?: string[];
  };
  description?: string;
};

function telegramApiUrl(method: string): string {
  return `https://api.telegram.org/bot${requiredEnv("TELEGRAM_BOT_TOKEN")}/${method}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTelegram<T>(method: string, payload: Record<string, unknown>, retries = 3): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(telegramApiUrl(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (response.ok && json.ok !== false) {
        return json as T;
      }

      console.error(`[telegram] ${method} failed`, {
        attempt,
        status: response.status,
        description: json.description,
      });
    } catch (error) {
      console.error(`[telegram] ${method} error`, { attempt, error });
    }

    if (attempt < retries) {
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return null;
}

export function buildStatusKeyboard(recordType: "booking" | "order", recordId: string, statuses: string[][]): InlineKeyboard {
  return statuses.map((row) =>
    row.map((status) => ({
      text: STATUS_LABELS[status] ?? status,
      callback_data: `update:${recordType}:${recordId}:${status}`,
    }))
  );
}

export function expectedWebhookUrl(): string {
  return `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/telegram-webhook`;
}

export async function ensureTelegramWebhook(): Promise<{ ok: boolean; changed: boolean; currentUrl?: string; expectedUrl: string }> {
  const expectedUrl = expectedWebhookUrl();
  const info = await callTelegram<TelegramWebhookInfoResult>("getWebhookInfo", {}, 1);
  const currentUrl = info?.result?.url ?? "";

  if (info?.ok && currentUrl === expectedUrl) {
    return { ok: true, changed: false, currentUrl, expectedUrl };
  }

  const setResult = await callTelegram<{ ok: boolean; description?: string }>("setWebhook", {
    url: expectedUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });

  return {
    ok: Boolean(setResult?.ok),
    changed: true,
    currentUrl,
    expectedUrl,
  };
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  inlineKeyboard?: InlineKeyboard,
): Promise<TelegramSendMessageResult | null> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (inlineKeyboard) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  return callTelegram<TelegramSendMessageResult>("sendMessage", payload);
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function editMessageReplyMarkup(chatId: number, messageId: number): Promise<void> {
  await callTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}
