/**
 * Supabase 管理员客户端
 *
 * 使用 service_role key，绕过 RLS 策略
 * 仅用于服务端后台操作（轮询器、配置加载等）
 *
 * ⚠️ 警告：切勿在客户端代码中导入此模块
 */

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {getSupabaseDbSchema, resolveSupabaseConfig} from "@/lib/supabase/config";

const DB_SCHEMA = getSupabaseDbSchema();

/**
 * 创建管理员客户端（绕过 RLS）
 *
 * 注意：此客户端使用 service_role key，拥有完整的数据库访问权限
 * 仅应在服务端后台任务中使用
 */
export function createAdminClient(input?: {allowDraft?: boolean}) {
  const config = resolveSupabaseConfig({allowDraft: input?.allowDraft});

  if (!config) {
    throw new Error(
      input?.allowDraft
        ? "缺少可用的 Supabase URL 或 service-role key（环境变量或托管草稿均未配置）"
        : "缺少可用的 Supabase URL 或 service-role key（环境变量或已启用托管配置均未配置）"
    );
  }

  return createSupabaseClient(config.url, config.serviceRoleKey, {
    db: { schema: DB_SCHEMA },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
