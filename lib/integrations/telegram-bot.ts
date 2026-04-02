import "server-only";

import {loadDashboardData} from "@/lib/core/dashboard-data";
import {getAvailableGroups, loadGroupDashboardData} from "@/lib/core/group-data";
import {loadTelegramNotificationSettings} from "@/lib/telegram-notification-settings";
import {sendTelegramMessage} from "@/lib/integrations/telegram";

interface TelegramUser {
  id: number;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: TelegramUser;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function row(label: string, value: string): string {
  return `<b>${esc(label)}：</b> ${esc(value)}`;
}

function block(title: string, rows: string[]): string {
  return [`<b>${esc(title)}</b>`, "", ...rows].join("\n");
}

function getAuthorizedChatId(settingsChatId: string): number | null {
  const n = Number(settingsChatId);
  return Number.isFinite(n) ? n : null;
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  if (!settings.bot_token) return;
  await fetch(`https://api.telegram.org/bot${settings.bot_token}/answerCallbackQuery`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({callback_query_id: callbackQueryId, text}),
    cache: "no-store",
  }).catch(() => undefined);
}

async function sendTelegramHtml(text: string, replyMarkup?: unknown): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  await sendTelegramMessage(text, {parseMode: "HTML"});
  if (!replyMarkup || !settings.bot_token || !settings.chat_id) return;
  await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: settings.chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
    cache: "no-store",
  });
}

function summarizeDashboard(data: Awaited<ReturnType<typeof loadDashboardData>>): string {
  const failed = data.providerTimelines.filter((item) => ["failed", "validation_failed", "error", "timeout"].includes(item.latest.status));
  const ok = data.providerTimelines.length - failed.length;
  const latencyValues = data.providerTimelines
    .map((item) => item.latest.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avg = latencyValues.length > 0 ? `${Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)} ms` : "N/A";
  const overall = data.total === 0 ? "未知" : failed.length === 0 ? "正常" : failed.length === data.total ? "异常" : "部分异常";
  return block("📊 当前站点状态", [
    row("总体状态", overall),
    row("检测总数", String(data.total)),
    row("成功", String(ok)),
    row("失败", String(failed.length)),
    row("平均延迟", avg),
    row("轮询周期", data.pollIntervalLabel),
    row("更新时间", data.lastUpdated ? new Date(data.lastUpdated).toLocaleString("zh-CN", {hour12: false, timeZone: "Asia/Shanghai"}) + " (CST)" : "暂无"),
  ]);
}

function groupsKeyboard(groups: string[]) {
  return {
    inline_keyboard: groups.slice(0, 24).reduce<Array<Array<{text: string; callback_data: string}>>>((acc, group, index) => {
      if (index % 2 === 0) acc.push([]);
      acc[acc.length - 1].push({text: group, callback_data: `group:${group}`});
      return acc;
    }, []).concat([[{text: "🚀 全量测试", callback_data: "action:fulltest"}]])
  };
}

async function handleCommand(text: string): Promise<void> {
  const command = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (!command) return;

  if (command === "/start" || command === "/help") {
    await sendTelegramHtml(block("🤖 通知中心机器人", [
      "你现在可以直接在 Telegram 里查看状态和触发测试。",
      "",
      "支持命令：",
      "/status 查看当前站点状态",
      "/groups 查看分组并点按钮测试",
      "/fulltest 触发一次全量测试",
      "/help 查看帮助",
    ]));
    return;
  }

  if (command === "/status") {
    const data = await loadDashboardData({refreshMode: "never"});
    await sendTelegramHtml(summarizeDashboard(data), {
      inline_keyboard: [
        [
          {text: "📚 查看分组", callback_data: "action:groups"},
          {text: "🚀 全量测试", callback_data: "action:fulltest"},
        ],
      ],
    });
    return;
  }

  if (command === "/groups") {
    const groups = await getAvailableGroups();
    await sendTelegramHtml(block("🧪 可测试分组", [row("分组数", String(groups.length)), "点击下面按钮即可直接测试对应分组。"]), groupsKeyboard(groups));
    return;
  }

  if (command === "/fulltest") {
    await sendTelegramHtml(block("🚀 全量测试", ["已开始执行全量测试，完成后会继续把结果发给你。"]));
    const data = await loadDashboardData({refreshMode: "always", bypassCache: true});
    await sendTelegramHtml(summarizeDashboard(data));
  }
}

async function handleCallback(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const data = callbackQuery.data ?? "";
  await answerCallbackQuery(callbackQuery.id, "收到，正在处理…");

  if (data === "action:groups") {
    const groups = await getAvailableGroups();
    await sendTelegramHtml(block("🧪 可测试分组", [row("分组数", String(groups.length)), "点击下面按钮即可直接测试对应分组。"]), groupsKeyboard(groups));
    return;
  }

  if (data === "action:fulltest") {
    await sendTelegramHtml(block("🚀 全量测试", ["已开始执行全量测试，完成后会继续把结果发给你。"]));
    const dashboard = await loadDashboardData({refreshMode: "always", bypassCache: true});
    await sendTelegramHtml(summarizeDashboard(dashboard));
    return;
  }

  if (data.startsWith("group:")) {
    const groupName = data.slice("group:".length);
    await sendTelegramHtml(block("🧪 分组测试", [row("目标分组", groupName), "已开始执行，完成后会继续把结果发给你。"]));
    const result = await loadGroupDashboardData(groupName, {
      refreshMode: "never",
      bypassCache: true,
      forceRefreshNow: true,
    });
    if (!result) {
      await sendTelegramHtml(block("⚠️ 分组测试", [row("目标分组", groupName), row("结果", "未找到对应分组") ]));
      return;
    }
    const failed = result.providerTimelines.filter((item) => ["failed", "validation_failed", "error", "timeout"].includes(item.latest.status));
    const ok = result.providerTimelines.length - failed.length;
    const avgValues = result.providerTimelines.map((item) => item.latest.latencyMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const avg = avgValues.length > 0 ? `${Math.round(avgValues.reduce((a, b) => a + b, 0) / avgValues.length)} ms` : "N/A";
    await sendTelegramHtml(block("🧪 分组测试结果", [
      row("分组", result.displayName),
      row("检测数", String(result.total)),
      row("成功", String(ok)),
      row("失败", String(failed.length)),
      row("平均延迟", avg),
      row("更新时间", result.lastUpdated ? new Date(result.lastUpdated).toLocaleString("zh-CN", {hour12: false, timeZone: "Asia/Shanghai"}) + " (CST)" : "暂无"),
    ]));
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<{ok: true} | {ok: false; reason: string}> {
  const settings = await loadTelegramNotificationSettings();
  const allowedChatId = getAuthorizedChatId(settings.chat_id);
  if (!settings.bot_token || !allowedChatId) {
    return {ok: false, reason: "telegram_not_configured"};
  }

  const messageChatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
  if (messageChatId !== allowedChatId) {
    if (update.callback_query?.id) {
      await answerCallbackQuery(update.callback_query.id, "未授权");
    }
    return {ok: false, reason: "unauthorized_chat"};
  }

  if (update.message?.text) {
    await handleCommand(update.message.text);
    return {ok: true};
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return {ok: true};
  }

  return {ok: false, reason: "ignored"};
}
