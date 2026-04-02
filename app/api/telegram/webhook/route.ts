import {NextResponse} from "next/server";

import {handleTelegramUpdate, type TelegramUpdate} from "@/lib/integrations/telegram-bot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!body) {
    return NextResponse.json({ok: false, error: "invalid_body"}, {status: 400});
  }

  try {
    const result = await handleTelegramUpdate(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[check-cx] Telegram webhook 处理失败", error);
    return NextResponse.json({ok: false, error: "internal_error"}, {status: 500});
  }
}
