import {NextResponse} from "next/server";

import {requireAdminSession} from "@/lib/admin/auth";
import {discoverProviderModels} from "@/lib/admin/model-discovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  await requireAdminSession();
  const body = await request.json().catch(() => null) as {type?: "openai" | "anthropic" | "gemini"; baseUrl?: string; apiKey?: string} | null;
  if (!body?.type || !body?.baseUrl) {
    return NextResponse.json({ok: false, error: "missing_params"}, {status: 400});
  }
  try {
    const result = await discoverProviderModels({type: body.type, baseUrl: body.baseUrl, apiKey: body.apiKey ?? null});
    return NextResponse.json({ok: true, ...result});
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型发现失败";
    return NextResponse.json({ok: false, error: message}, {status: 400});
  }
}
