"use client";

import {useEffect, useMemo, useState, useTransition} from "react";

import {AdminInput, AdminSelect} from "@/components/admin/admin-primitives";
import type {DiscoveredModelItem} from "@/lib/admin/model-discovery";

interface DiscoveryState {
  models: DiscoveredModelItem[];
  defaultGroupName: string;
}

export function ModelImportSelector({
  initialType,
  initialBaseUrl,
  initialApiKey,
  initialDiscovery,
  groupNames,
  resetToken,
}: {
  initialType: "openai" | "anthropic" | "gemini";
  initialBaseUrl: string;
  initialApiKey: string;
  initialDiscovery: DiscoveryState | null;
  groupNames: string[];
  resetToken?: string;
}) {
  const [discoverType, setDiscoverType] = useState(initialType);
  const [discoverBaseUrl, setDiscoverBaseUrl] = useState(initialBaseUrl);
  const [discoverApiKey, setDiscoverApiKey] = useState(initialApiKey);
  const [discovery, setDiscovery] = useState<DiscoveryState | null>(initialDiscovery);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set((initialDiscovery?.models ?? []).map((item) => item.id)));
  const [groupMode, setGroupMode] = useState<"existing" | "new">("new");
  const [localGroupNames, setLocalGroupNames] = useState<string[]>(groupNames);
  const [newGroupDraft, setNewGroupDraft] = useState(initialDiscovery?.defaultGroupName ?? "");

  const models = discovery?.models ?? [];
  const defaultGroupName = discovery?.defaultGroupName ?? "";

  useEffect(() => {
    setDiscoverType(initialType);
    setDiscoverBaseUrl(initialBaseUrl);
    setDiscoverApiKey(initialApiKey);
    setDiscovery(initialDiscovery);
    setError("");
    setQuery("");
    setSelected(new Set((initialDiscovery?.models ?? []).map((item) => item.id)));
    setGroupMode("new");
    setLocalGroupNames(groupNames);
    setNewGroupDraft(initialDiscovery?.defaultGroupName ?? "");
  }, [groupNames, initialApiKey, initialBaseUrl, initialDiscovery, initialType, resetToken]);

  useEffect(() => {
    setLocalGroupNames(groupNames);
  }, [groupNames]);

  useEffect(() => {
    if (!newGroupDraft && defaultGroupName) {
      setNewGroupDraft(defaultGroupName);
    }
  }, [defaultGroupName, newGroupDraft]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return models;
    return models.filter((item) => item.id.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword));
  }, [models, query]);

  function toggle(modelId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modelId); else next.delete(modelId);
      return next;
    });
  }

  function applyFiltered(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of filtered) {
        if (checked) next.add(item.id); else next.delete(item.id);
      }
      return next;
    });
  }

  function applyAll(checked: boolean) {
    setSelected(() => checked ? new Set(models.map((item) => item.id)) : new Set());
  }

  async function runDiscovery() {
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/discover-models", {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({type: discoverType, baseUrl: discoverBaseUrl, apiKey: discoverApiKey}),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "模型拉取失败");
          return;
        }
        setDiscovery({models: data.models, defaultGroupName: data.defaultGroupName});
        setSelected(new Set((data.models as DiscoveredModelItem[]).map((item) => item.id)));
        setNewGroupDraft(data.defaultGroupName || "");
        if (data.defaultGroupName && !localGroupNames.includes(data.defaultGroupName)) {
          setLocalGroupNames((prev) => [...prev, data.defaultGroupName].sort((a, b) => a.localeCompare(b, "zh-CN")));
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "模型拉取失败");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-[1.5rem] border border-border/40 bg-background/60 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Provider 类型</span>
            <AdminSelect value={discoverType} onChange={(e) => setDiscoverType(e.target.value as typeof discoverType)}>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
              <option value="gemini">gemini</option>
            </AdminSelect>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Base URL</span>
            <AdminInput value={discoverBaseUrl} onChange={(e) => setDiscoverBaseUrl(e.target.value)} placeholder="https://example.com/v1" />
          </label>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">API Key</span>
          <AdminInput type="password" value={discoverApiKey} onChange={(e) => setDiscoverApiKey(e.target.value)} placeholder="sk-..." />
        </label>
        <button type="button" onClick={runDiscovery} disabled={isPending} className="w-full rounded-full border border-border/40 bg-background/80 px-4 py-3 text-sm font-medium shadow-sm disabled:opacity-60">
          {isPending ? "正在拉取模型…" : "拉取模型列表"}
        </button>
        {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      </div>

      {discovery ? (
        <div className="space-y-4 rounded-[1.5rem] border border-border/40 bg-background/60 p-4">
          <input type="hidden" name="discover_type" value={discoverType} readOnly />
          <input type="hidden" name="discover_base_url" value={discoverBaseUrl} readOnly />
          <input type="hidden" name="discover_api_key" value={discoverApiKey} readOnly />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <button type="button" onClick={() => setGroupMode("existing")} className={`rounded-full border px-4 py-2 text-sm ${groupMode === "existing" ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-background/80"}`}>
                  使用已有分组
                </button>
                <button type="button" onClick={() => setGroupMode("new")} className={`rounded-full border px-4 py-2 text-sm ${groupMode === "new" ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-background/80"}`}>
                  新建一个分组名
                </button>
              </div>

              {groupMode === "existing" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">默认分组（已有分组）</span>
                  <AdminSelect name="default_group_name_existing" defaultValue="">
                    <option value="">请选择已有分组</option>
                    {localGroupNames.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </AdminSelect>
                  <input type="hidden" name="default_group_name_new" value="" readOnly />
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">默认分组（新分组）</span>
                  <AdminInput name="default_group_name_new" value={newGroupDraft} onChange={(e) => setNewGroupDraft(e.target.value)} placeholder="Auto/example.com" />
                  <input type="hidden" name="default_group_name_existing" value="" readOnly />
                </label>
              )}

              <div className="text-xs text-muted-foreground">现在可以明确选择“使用已有分组”或“新建一个分组名”；新增 provider 时若分组不存在，会自动补建到分组列表里。</div>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">选择摘要</span>
              <div className="rounded-2xl border border-border/40 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                共 {models.length} 个模型，当前筛选 {filtered.length} 个，已勾选 {selected.size} 个。
              </div>
            </div>
          </div>

          {discoverType === "openai" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/70 px-4 py-3 text-sm shadow-sm">
                <input type="checkbox" name="openai_endpoint_chat" defaultChecked className="mt-1 h-4 w-4" />
                <span><span className="block font-medium text-foreground">添加 /v1/chat/completions</span><span className="block text-xs leading-5 text-muted-foreground">保存时自动纠正常见 chat/completion 拼写错误。</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/70 px-4 py-3 text-sm shadow-sm">
                <input type="checkbox" name="openai_endpoint_responses" defaultChecked className="mt-1 h-4 w-4" />
                <span><span className="block font-medium text-foreground">添加 /v1/responses</span><span className="block text-xs leading-5 text-muted-foreground">保存时自动纠正常见 response/responses 拼写错误。</span></span>
              </label>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/70 px-4 py-3 text-sm shadow-sm">
              <input type="checkbox" name="enabled" defaultChecked className="mt-1 h-4 w-4" />
              <span><span className="block font-medium text-foreground">导入后默认启用</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/70 px-4 py-3 text-sm shadow-sm">
              <input type="checkbox" name="is_maintenance" className="mt-1 h-4 w-4" />
              <span><span className="block font-medium text-foreground">导入后默认维护模式</span></span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
            <AdminInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型，例如 gpt-4o / sonnet / gemini / grok" />
            <button type="button" onClick={() => applyAll(true)} className="rounded-full border border-border/40 bg-background/80 px-4 py-2 text-sm">全选全部</button>
            <button type="button" onClick={() => applyFiltered(true)} className="rounded-full border border-border/40 bg-background/80 px-4 py-2 text-sm">全选筛选结果</button>
            <button type="button" onClick={() => filtered.length === models.length ? applyAll(false) : applyFiltered(false)} className="rounded-full border border-border/40 bg-background/80 px-4 py-2 text-sm">清空当前范围</button>
          </div>

          <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
            {filtered.map((item) => {
              const checked = selected.has(item.id);
              return (
                <label key={item.id} className="block rounded-[1.25rem] border border-border/40 bg-background/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={checked} onChange={(event) => toggle(item.id, event.target.checked)} className="mt-1 h-4 w-4" />
                      {checked ? <input type="hidden" name="selected_models" value={item.id} /> : null}
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.id}</div>
                        <div className="text-xs text-muted-foreground">{item.name}</div>
                      </div>
                    </div>
                    <div className="w-full md:w-[280px]">
                      <AdminInput name={`group_for__${item.id}`} list="admin-group-name-options" placeholder={defaultGroupName || "填写分组，留空使用默认分组"} />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {localGroupNames.length > 0 ? <div className="text-xs text-muted-foreground">已有分组：{localGroupNames.join(" / ")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
