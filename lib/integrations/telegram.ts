import "server-only";

import {loadTelegramNotificationSettings} from "@/lib/telegram-notification-settings";

export function maskBotToken(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "********";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function sendTelegramMessage(
  text: string,
  options?: {botToken?: string; chatId?: string; ignoreEnabled?: boolean; parseMode?: "HTML" | "MarkdownV2"}
): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  const botToken = options?.botToken ?? settings.bot_token;
  const chatId = options?.chatId ?? settings.chat_id;
  if (!options?.ignoreEnabled && !settings.enabled) return;
  if (!botToken || !chatId) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram API ${response.status}: ${body || "send failed"}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramTestMessage(input?: {botToken?: string; chatId?: string}): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  const botToken = input?.botToken?.trim() || settings.bot_token;
  const chatId = input?.chatId?.trim() || settings.chat_id;
  if (!botToken || !chatId) {
    throw new Error("请先填写 Bot Token 和 Chat ID");
  }
  const text = `✅ check-cx Telegram 通知已连接成功\n时间: ${new Date().toISOString()}\nChat ID: ${chatId}`;
  await sendTelegramMessage(text, {botToken, chatId, ignoreEnabled: true});
}
