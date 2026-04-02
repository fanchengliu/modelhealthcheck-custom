import {NextResponse} from "next/server";

import {getAdminSession} from "@/lib/admin/auth";
import {getPollingIntervalLabel} from "@/lib/core/polling-config";
import {maybeNotifyPartialRefresh} from "@/lib/integrations/telegram-health-notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({error: "unauthorized"}, {status: 401});
  }

  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === "auto" ? "auto" : "manual";
  try {
    await maybeNotifyPartialRefresh(kind, {pollIntervalLabel: getPollingIntervalLabel()});
    return NextResponse.json({ok: true});
  } catch (error) {
    const message = error instanceof Error ? error.message : "notify failed";
    return NextResponse.json({error: message}, {status: 500});
  }
}
