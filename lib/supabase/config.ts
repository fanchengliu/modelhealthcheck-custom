import "server-only";

import {
  getManagedStorageRuntimeOverride,
  getManagedSupabaseDraftConfig,
} from "@/lib/storage/bootstrap-store";

export interface ResolvedSupabaseConfig {
  url: string;
  publishableOrAnonKey: string | null;
  serviceRoleKey: string;
  dbUrl: string | null;
  schema: string;
  source: "managed:bootstrap" | "managed:draft" | "env";
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getSupabaseDbSchema(): string {
  return normalizeValue(process.env.SUPABASE_DB_SCHEMA) ?? "public";
}

function getEnvSupabaseConfig(): ResolvedSupabaseConfig | null {
  const url = normalizeValue(process.env.SUPABASE_URL);
  const serviceRoleKey = normalizeValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    publishableOrAnonKey: normalizeValue(process.env.SUPABASE_PUBLISHABLE_OR_ANON_KEY),
    serviceRoleKey,
    dbUrl: normalizeValue(process.env.SUPABASE_DB_URL),
    schema: getSupabaseDbSchema(),
    source: "env",
  };
}

function getManagedRuntimeSupabaseConfig(): ResolvedSupabaseConfig | null {
  const override = getManagedStorageRuntimeOverride();
  if (!override) {
    return null;
  }

  const usesSupabase =
    override.primaryProvider === "supabase" || override.backupProvider === "supabase";
  if (!usesSupabase || !override.supabaseUrl || !override.supabaseServiceRoleKey) {
    return null;
  }

  return {
    url: override.supabaseUrl,
    publishableOrAnonKey: normalizeValue(override.supabasePublishableKey),
    serviceRoleKey: override.supabaseServiceRoleKey,
    dbUrl: normalizeValue(override.supabaseDbUrl),
    schema: getSupabaseDbSchema(),
    source: "managed:bootstrap",
  };
}

function getManagedDraftSupabaseConfig(): ResolvedSupabaseConfig | null {
  const draft = getManagedSupabaseDraftConfig();
  if (!draft.url || !draft.serviceRoleKey) {
    return null;
  }

  return {
    url: draft.url,
    publishableOrAnonKey: normalizeValue(draft.publishableKey),
    serviceRoleKey: draft.serviceRoleKey,
    dbUrl: normalizeValue(draft.dbUrl),
    schema: getSupabaseDbSchema(),
    source: "managed:draft",
  };
}

export function resolveSupabaseConfig(input?: {allowDraft?: boolean}): ResolvedSupabaseConfig | null {
  return (
    getManagedRuntimeSupabaseConfig() ??
    getEnvSupabaseConfig() ??
    (input?.allowDraft ? getManagedDraftSupabaseConfig() : null)
  );
}

export function hasSupabaseStorageConfig(input?: {allowDraft?: boolean}): boolean {
  return Boolean(resolveSupabaseConfig(input));
}

export function resolveSupabasePublicConfig(input?: {allowDraft?: boolean}): {
  url: string;
  key: string;
  schema: string;
  source: ResolvedSupabaseConfig["source"];
} | null {
  const config = resolveSupabaseConfig(input);
  if (!config?.publishableOrAnonKey) {
    return null;
  }

  return {
    url: config.url,
    key: config.publishableOrAnonKey,
    schema: config.schema,
    source: config.source,
  };
}

export function resolveSupabaseDirectDbUrl(input?: {allowDraft?: boolean}): {
  connectionString: string;
  source: string;
} | null {
  const config = resolveSupabaseConfig(input);
  if (!config?.dbUrl) {
    return null;
  }

  return {
    connectionString: config.dbUrl,
    source: `${config.source}:SUPABASE_DB_URL`,
  };
}
