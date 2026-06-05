import { NextResponse } from "next/server";
import { GenerateVideoRequest } from "@/lib/api";
import { generateClip } from "@/server/ai/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// RunWay のポーリング完了まで待てるよう上限を引き上げる。
export const maxDuration = 300;

/** POST /api/generate/video — シーンの動画クリップを生成する（要件 3.1）。 */
export async function POST(req: Request) {
  let body: GenerateVideoRequest;
  try {
    body = (await req.json()) as GenerateVideoRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const result = await generateClip(body.prompt ?? "", {
    apiKey: req.headers.get("x-runway-key") || undefined,
    promptImage: body.promptImage,
    durationSec: body.durationSec,
  });
  return NextResponse.json(result);
}
