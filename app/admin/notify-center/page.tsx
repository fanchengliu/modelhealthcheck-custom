import {MessageSquareMore} from "lucide-react";

import {
  sendTelegramTestMessageAction,
  upsertTelegramNotificationSettingsAction,
} from "@/app/admin/actions";
import {
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminPageIntro,
  AdminPanel,
  AdminStatusBanner,
} from "@/components/admin/admin-primitives";
import {Button} from "@/components/ui/button";
import {requireAdminSession} from "@/lib/admin/auth";
import {getAdminFeedback} from "@/lib/admin/view";
import {maskBotToken} from "@/lib/integrations/telegram";
import {loadTelegramNotificationSettings} from "@/lib/telegram-notification-settings";

export const dynamic = "force-dynamic";

interface NotifyCenterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotifyCenterPage({searchParams}: NotifyCenterPageProps) {
  await requireAdminSession();
  const [params, telegramSettings] = await Promise.all([searchParams, loadTelegramNotificationSettings()]);
  const feedback = getAdminFeedback(params);

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Admin / Notify Center"
        title="通知中心"
        description="把 Telegram 通知、测试发送和后续双向机器人控制统一收拢到这里，不再混在站点品牌设置里。"
      />

      {feedback ? <AdminStatusBanner type={feedback.type} message={feedback.message} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <AdminPanel
            title="Telegram 通知配置"
            description="配置 Bot Token 与 Chat ID，并控制哪些动作会向 Telegram 发消息。"
          >
            <div className="space-y-4">
              <form action={upsertTelegramNotificationSettingsAction} className="space-y-4">
                <input type="hidden" name="returnTo" value="/admin/notify-center" />

                <AdminField label="Bot Token" description={`当前已保存：${telegramSettings.bot_token ? maskBotToken(telegramSettings.bot_token) : "未配置"}`}>
                  <AdminInput name="telegram_bot_token" placeholder="留空表示沿用已保存 Token" />
                </AdminField>

                <AdminField label="Chat ID" description="例如私聊用户 ID 或群聊 ID。留空表示沿用已保存值。">
                  <AdminInput name="telegram_chat_id" defaultValue={telegramSettings.chat_id} placeholder="8533583778" />
                </AdminField>

                <div className="grid gap-3 md:grid-cols-2">
                  <AdminCheckbox name="telegram_enabled" defaultChecked={telegramSettings.enabled} label="启用 Telegram 通知" description="关闭后不会对外发送 Telegram 消息。" />
                  <AdminCheckbox name="notify_on_group_test" defaultChecked={telegramSettings.notify_on_group_test} label="测试本组后通知" />
                  <AdminCheckbox name="notify_on_full_test" defaultChecked={telegramSettings.notify_on_full_test} label="全量测试后通知" />
                  <AdminCheckbox name="notify_on_partial_refresh" defaultChecked={telegramSettings.notify_on_partial_refresh} label="部分刷新后通知" />
                  <AdminCheckbox name="notify_on_auto_refresh" defaultChecked={telegramSettings.notify_on_auto_refresh} label="自动刷新后通知" />
                  <AdminCheckbox name="only_on_failure_for_auto_refresh" defaultChecked={telegramSettings.only_on_failure_for_auto_refresh} label="自动刷新仅异常时通知" />
                </div>

                <Button type="submit" className="w-full rounded-full">
                  保存通知中心设置
                </Button>
              </form>

              <form action={sendTelegramTestMessageAction} className="space-y-3">
                <input type="hidden" name="returnTo" value="/admin/notify-center" />
                <input type="hidden" name="telegram_bot_token" value={telegramSettings.bot_token} />
                <input type="hidden" name="telegram_chat_id" value={telegramSettings.chat_id} />
                <Button type="submit" variant="outline" className="w-full rounded-full">
                  发送 Telegram 测试消息
                </Button>
              </form>
            </div>
          </AdminPanel>
        </div>

        <AdminPanel
          title="机器人控制（第一版规划）"
          description="双向控制正在接入：后续这里会显示 webhook 状态、允许用户、支持命令和最近交互结果。"
          trailing={<MessageSquareMore className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-[1.5rem] border border-border/40 bg-background/70 p-4 shadow-sm">
              <div className="font-medium text-foreground">计划支持的命令</div>
              <div className="mt-2 space-y-1">
                <div><code>/start</code> 开始使用机器人控制</div>
                <div><code>/help</code> 查看命令说明</div>
                <div><code>/status</code> 查看当前站点状态摘要</div>
                <div><code>/groups</code> 查看分组并点按钮测试</div>
                <div><code>/fulltest</code> 触发一次全量测试</div>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-dashed border-border/40 bg-background/50 p-4">
              当前页面已独立为“通知中心”；下一步会继续接 Telegram webhook、命令处理和 inline buttons。
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}
