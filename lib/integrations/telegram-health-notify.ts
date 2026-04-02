import "server-only";

import {getAvailabilityStats} from "@/lib/database/availability";
import type {AvailabilityStat, CheckResult} from "@/lib/types";
import {loadTelegramNotificationSettings} from "@/lib/telegram-notification-settings";
import {sendTelegramMessage} from "@/lib/integrations/telegram";

const FAILURE = new Set(["failed", "validation_failed", "error"]);

function formatTime(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} (CST)`;
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value} ms` : "N/A";
}

function avgLatency(results: CheckResult[]): string {
  const values = results.map((r) => r.latencyMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return "N/A";
  return `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)} ms`;
}

function summarize(results: CheckResult[]) {
  const failed = results.filter((r) => FAILURE.has(r.status));
  const ok = results.length - failed.length;
  return {failed, ok};
}

function statusLabel(failedCount: number, total: number): string {
  if (failedCount <= 0) return "正常";
  if (failedCount >= total) return "异常";
  return "部分异常";
}

function officialStatusLabel(value?: string | null): string {
  if (!value) return "未知";
  const normalized = value.toLowerCase();
  if (normalized.includes("operational")) return "正常";
  if (normalized.includes("degraded")) return "降级";
  if (normalized.includes("outage")) return "异常";
  return value;
}

function failureReasonZh(status: string, message?: string | null): string {
  switch (status) {
    case "validation_failed": return "校验失败" + (message ? `：${message}` : "");
    case "failed": return "检测失败" + (message ? `：${message}` : "");
    case "error": return "请求异常" + (message ? `：${message}` : "");
    case "timeout": return "请求超时" + (message ? `：${message}` : "");
    case "maintenance": return "维护中";
    case "pending": return "等待首次检测";
    case "operational": return "正常";
    default: return message ? `${status}：${message}` : status;
  }
}

function stat7d(stats?: AvailabilityStat[]): AvailabilityStat | undefined {
  return stats?.find((item) => item.period === "7d") ?? stats?.[0];
}

async function loadStatsMap(results: CheckResult[]) {
  return getAvailabilityStats(results.map((item) => item.id));
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

export async function maybeNotifyGroupTest(groupName: string, results: CheckResult[]): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  if (!settings.enabled || !settings.notify_on_group_test) return;

  const statsMap = await loadStatsMap(results);
  const {failed, ok} = summarize(results);
  const parts: string[] = [];

  parts.push(block("🧪 分组测试通知", [
    row("分组", groupName),
    row("检测数", String(results.length)),
    row("成功", String(ok)),
    row("失败", String(failed.length)),
    row("平均延迟", avgLatency(results)),
    "",
    row("状态", statusLabel(failed.length, results.length)),
    row("时间", formatTime()),
  ]));

  if (results.length === 1) {
    const item = results[0];
    const s7 = stat7d(statsMap[item.id]);
    const detailRows = [
      row("模型", item.name),
      row("对话延迟", formatMs(item.latencyMs)),
      row("端点 PING", formatMs(item.pingLatencyMs)),
      row("官方状态", officialStatusLabel(item.officialStatus?.status ?? null)),
      row("7天可用性", s7 ? `${s7.operationalCount} / ${s7.totalChecks}` : "暂无数据"),
      row("可用率", s7?.availabilityPct == null ? "暂无数据" : `${s7.availabilityPct.toFixed(2)}%`),
      row("历史样本", s7 ? `${s7.totalChecks} 次` : "0 次"),
    ];
    if (FAILURE.has(item.status)) {
      detailRows.push(row("失败原因", failureReasonZh(item.status, item.message)));
    }
    parts.push(block("模型状态", detailRows));
  } else if (failed.length > 0) {
    const abnormalBlocks = failed.slice(0, 5).map((item) => {
      const s7 = stat7d(statsMap[item.id]);
      return block(`异常项 · ${item.name}`, [
        row("对话延迟", formatMs(item.latencyMs)),
        row("端点 PING", formatMs(item.pingLatencyMs)),
        row("官方状态", officialStatusLabel(item.officialStatus?.status ?? null)),
        row("可用率", s7?.availabilityPct == null ? "暂无数据" : `${s7.availabilityPct.toFixed(2)}%`),
        row("失败原因", failureReasonZh(item.status, item.message)),
      ]);
    });
    parts.push(...abnormalBlocks);
  }

  await sendTelegramMessage(parts.join("\n\n"), {parseMode: "HTML"});
}

export async function maybeNotifyFullTest(results: CheckResult[]): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  if (!settings.enabled || !settings.notify_on_full_test) return;

  const statsMap = await loadStatsMap(results);
  const {failed, ok} = summarize(results);
  const stats = results.flatMap((item) => {
    const stat = stat7d(statsMap[item.id]);
    return stat ? [stat] : [];
  });
  const overallPct = stats.length > 0
    ? `${(stats.reduce((sum, item) => sum + (item.availabilityPct ?? 0), 0) / stats.length).toFixed(2)}%`
    : "暂无数据";

  const parts: string[] = [];
  parts.push(block("🚀 全量测试通知", [
    row("检测总数", String(results.length)),
    row("成功", String(ok)),
    row("失败", String(failed.length)),
    row("平均延迟", avgLatency(results)),
    "",
    row("状态", statusLabel(failed.length, results.length)),
    row("时间", formatTime()),
    row("7天可用率", overallPct),
  ]));

  if (failed.length > 0) {
    parts.push(...failed.slice(0, 8).map((item) => {
      const s = stat7d(statsMap[item.id]);
      return block(`异常项 · ${item.groupName || "默认分组"}/${item.name}`, [
        row("对话延迟", formatMs(item.latencyMs)),
        row("端点 PING", formatMs(item.pingLatencyMs)),
        row("官方状态", officialStatusLabel(item.officialStatus?.status ?? null)),
        row("可用率", s?.availabilityPct == null ? "暂无数据" : `${s.availabilityPct.toFixed(2)}%`),
        row("失败原因", failureReasonZh(item.status, item.message)),
      ]);
    }));
  }

  await sendTelegramMessage(parts.join("\n\n"), {parseMode: "HTML"});
}

export async function maybeNotifyPartialRefresh(kind: "manual" | "auto", options?: {pollIntervalLabel?: string; nextUpdateInMinutes?: number | null}): Promise<void> {
  const settings = await loadTelegramNotificationSettings();
  if (!settings.enabled) return;
  const notifyEnabled = kind === "manual" ? settings.notify_on_partial_refresh : settings.notify_on_auto_refresh;
  if (!notifyEnabled) return;

  const rows = [
    row("触发方式", kind === "auto" ? "自动" : "手动"),
    row("状态", "完成"),
    row("时间", formatTime()),
  ];
  if (kind === "auto" && options?.pollIntervalLabel) rows.push(row("轮询周期", options.pollIntervalLabel));
  if (kind === "auto" && typeof options?.nextUpdateInMinutes === "number") rows.push(row("下次刷新", `约 ${options.nextUpdateInMinutes} 分钟后`));
  rows.push("", "说明：本次仅刷新页面数据，不是全量测试");

  await sendTelegramMessage(block(kind === "auto" ? "⏰ 自动刷新通知" : "🔄 部分刷新通知", rows), {parseMode: "HTML"});
}
