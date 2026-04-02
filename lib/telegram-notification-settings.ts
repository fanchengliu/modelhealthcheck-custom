import "server-only";

import type {TelegramNotificationSettingsRow} from "@/lib/types/database";
import {getControlPlaneStorage} from "@/lib/storage/resolver";

export const TELEGRAM_NOTIFICATION_SETTINGS_SINGLETON_KEY = "global";

export const DEFAULT_TELEGRAM_NOTIFICATION_SETTINGS: TelegramNotificationSettingsRow = {
  singleton_key: TELEGRAM_NOTIFICATION_SETTINGS_SINGLETON_KEY,
  enabled: false,
  bot_token: "",
  chat_id: "",
  notify_on_group_test: true,
  notify_on_full_test: true,
  notify_on_partial_refresh: false,
  notify_on_auto_refresh: false,
  only_on_failure_for_auto_refresh: true,
};

export async function loadTelegramNotificationSettings(): Promise<TelegramNotificationSettingsRow> {
  const storage = await getControlPlaneStorage();
  return (await storage.telegramNotifications.getSingleton(TELEGRAM_NOTIFICATION_SETTINGS_SINGLETON_KEY)) ?? DEFAULT_TELEGRAM_NOTIFICATION_SETTINGS;
}
