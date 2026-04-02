/**
 * 健康快照服务
 * - 统一管理历史读取、刷新和时间线装配
 */

import type {CheckResult, HistorySnapshot, ProviderConfig, ProviderTimeline, RefreshMode,} from "../types";
import {historySnapshotStore} from "../database/history";
import {runProviderChecks} from "../providers";
import {getPingCacheEntry} from "./global-state";
import {getOfficialStatus} from "./official-status-poller";
import {maybeNotifyFullTest} from "../integrations/telegram-health-notify";

export interface SnapshotScope {
  cacheKey: string;
  pollIntervalMs: number;
  activeConfigs: ProviderConfig[];
  allowedIds: Set<string>;
  limitPerConfig?: number;
}

async function readHistoryForScope(scope: SnapshotScope): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }
  return historySnapshotStore.fetch({
    allowedIds: scope.allowedIds,
    limitPerConfig: scope.limitPerConfig,
  });
}

export async function loadSnapshotForScope(
  scope: SnapshotScope,
  refreshMode: RefreshMode
): Promise<HistorySnapshot> {
  if (scope.allowedIds.size === 0) {
    return {};
  }

  const cacheEntry = getPingCacheEntry(scope.cacheKey);
  const now = Date.now();
  const shouldForceRefresh = refreshMode === "always";

  if (refreshMode === "never") {
    if (
      cacheEntry.history &&
      now - cacheEntry.lastPingAt < scope.pollIntervalMs
    ) {
      return cacheEntry.history;
    }
    const snapshot = await readHistoryForScope(scope);
    cacheEntry.history = snapshot;
    cacheEntry.lastPingAt = now;
    return snapshot;
  }

  const refreshHistory = async (): Promise<HistorySnapshot> => {
    if (scope.activeConfigs.length === 0) {
      return {};
    }

    if (
      !shouldForceRefresh &&
      cacheEntry.history &&
      now - cacheEntry.lastPingAt < scope.pollIntervalMs
    ) {
      return cacheEntry.history;
    }

    if (cacheEntry.inflight) {
      return cacheEntry.inflight;
    }

    const inflightPromise = (async () => {
      const results = await runProviderChecks(scope.activeConfigs);
      await historySnapshotStore.append(results);
      if (shouldForceRefresh) {
        void maybeNotifyFullTest(results).catch((error) => {
          console.error("[check-cx] Telegram 全量测试通知发送失败", error);
        });
      }
      const nextHistory = await readHistoryForScope(scope);
      cacheEntry.history = nextHistory;
      cacheEntry.lastPingAt = Date.now();
      return nextHistory;
    })();

    cacheEntry.inflight = inflightPromise;
    try {
      return await inflightPromise;
    } finally {
      if (cacheEntry.inflight === inflightPromise) {
        cacheEntry.inflight = undefined;
      }
    }
  };

  let history = await readHistoryForScope(scope);

  if (refreshMode === "always") {
    history = await refreshHistory();
  } else if (
    refreshMode === "missing" &&
    scope.activeConfigs.length > 0 &&
    Object.keys(history).length === 0
  ) {
    history = await refreshHistory();
  }

  return history;
}

export function buildProviderTimelines(
  history: HistorySnapshot,
  maintenanceConfigs: ProviderConfig[],
  activeConfigs: ProviderConfig[]
): ProviderTimeline[] {
  const configMap = new Map<string, ProviderConfig>(
    [...maintenanceConfigs, ...activeConfigs].map((config) => [config.id, config])
  );

  const mapped = Object.entries(history)
    .map<ProviderTimeline | null>(([id, items]) => {
      if (items.length === 0) {
        return null;
      }
      const currentConfig = configMap.get(id);
      const normalizedItems = currentConfig
        ? items.map((item) => ({ ...item, groupName: currentConfig.groupName || null }))
        : items;
      // historySnapshotStore 已按 checkedAt 倒序返回
      const latest = attachOfficialStatus({ ...normalizedItems[0] });
      return {
        id,
        items: normalizedItems,
        latest,
      };
    })
    .filter((timeline): timeline is ProviderTimeline => Boolean(timeline));

  const historyIds = new Set(mapped.map((timeline) => timeline.id));
  const pendingTimelines = activeConfigs
    .filter((config) => !historyIds.has(config.id))
    .map(createPendingTimeline);
  const maintenanceTimelines = maintenanceConfigs.map(createMaintenanceTimeline);

  return [...mapped, ...pendingTimelines, ...maintenanceTimelines].sort((a, b) =>
    a.latest.name.localeCompare(b.latest.name)
  );
}

function attachOfficialStatus(result: CheckResult): CheckResult {
  const officialStatus = getOfficialStatus(result.type);
  if (!officialStatus) {
    return result;
  }
  return { ...result, officialStatus };
}

function createMaintenanceTimeline(config: ProviderConfig): ProviderTimeline {
  const base: CheckResult = {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    status: "maintenance",
    latencyMs: null,
    pingLatencyMs: null,
    message: "配置处于维护模式",
    checkedAt: new Date().toISOString(),
    groupName: config.groupName || null,
  };

  return {
    id: config.id,
    items: [],
    latest: attachOfficialStatus(base),
  };
}

function createPendingTimeline(config: ProviderConfig): ProviderTimeline {
  const base: CheckResult = {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    model: config.model,
    status: "pending",
    latencyMs: null,
    pingLatencyMs: null,
    message: "配置已启用，等待首次检查结果",
    checkedAt: new Date().toISOString(),
    groupName: config.groupName || null,
  };

  return {
    id: config.id,
    items: [],
    latest: attachOfficialStatus(base),
  };
}
