import "server-only";

import {normalizeProviderEndpoint} from "@/lib/providers/endpoint-utils";
import type {ProviderType} from "@/lib/types";

export interface DiscoveredModelItem {
  id: string;
  name: string;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("模型发现接口返回了无法解析的 JSON");
  }
}

function normalizeBaseUrl(raw: string): URL {
  const value = raw.trim();
  if (!value) throw new Error("Base URL 不能为空");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Base URL 必须是合法 URL");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

export function buildDefaultGroupNameFromBaseUrl(baseUrl: string): string {
  const url = normalizeBaseUrl(baseUrl);
  return `Auto/${url.hostname}`;
}

export function buildDiscoveryModelsUrl(baseUrl: string): string {
  const url = normalizeBaseUrl(baseUrl);
  if (/\/models$/i.test(url.pathname)) return url.toString();
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
  return url.toString();
}

export function buildOpenAiSelectedEndpoints(baseUrl: string, includeChat: boolean, includeResponses: boolean): string[] {
  const url = normalizeBaseUrl(baseUrl);
  const basePath = url.pathname.replace(/\/(chat\/completions|responses)\/?$/i, "").replace(/\/+$/, "");
  const items: string[] = [];
  if (includeChat) {
    const next = new URL(url.toString());
    next.pathname = `${basePath}/chat/completions`;
    items.push(normalizeProviderEndpoint("openai", next.toString()));
  }
  if (includeResponses) {
    const next = new URL(url.toString());
    next.pathname = `${basePath}/responses`;
    items.push(normalizeProviderEndpoint("openai", next.toString()));
  }
  return Array.from(new Set(items));
}

export async function discoverProviderModels(input: {
  type: ProviderType;
  baseUrl: string;
  apiKey?: string | null;
}): Promise<{models: DiscoveredModelItem[]; discoveryUrl: string; defaultGroupName: string}> {
  const discoveryUrl = buildDiscoveryModelsUrl(input.baseUrl);
  const headers: Record<string, string> = {Accept: "application/json", "User-Agent": "curl/8.0"};
  if (input.apiKey?.trim()) {
    headers.Authorization = `Bearer ${input.apiKey.trim()}`;
  }

  const response = await fetch(discoveryUrl, {headers, cache: "no-store"});
  if (!response.ok) {
    throw new Error(`模型发现失败：HTTP ${response.status}`);
  }

  const data = parseJsonSafe(await response.text());
  const rawItems = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as {data?: unknown[]}).data)
      ? (data as {data: unknown[]}).data
      : null;

  if (!rawItems) {
    throw new Error("模型发现失败：返回结构中缺少 data 列表");
  }

  const models = rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : id;
      if (!id) return null;
      return {id, name};
    })
    .filter((item): item is DiscoveredModelItem => Boolean(item))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));

  if (models.length === 0) {
    throw new Error("模型发现成功，但没有可导入的模型");
  }

  return {models, discoveryUrl, defaultGroupName: buildDefaultGroupNameFromBaseUrl(input.baseUrl)};
}
