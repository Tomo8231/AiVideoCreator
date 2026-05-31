import { NextResponse } from "next/server";
import { GenerateAudioRequest } from "@/lib/api";
import { synthesizeNarration } from "@/server/ai/audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/generate/audio — ナレーション音声を合成する（要件 3.1）。 */
export async function POST(req: Request) {
  let body: GenerateAudioRequest;
  try {
    body = (await req.json()) as GenerateAudioRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const result = await synthesizeNarration(body.text ?? "", {
    apiKey: req.headers.get("x-elevenlabs-key") || undefined,
    voiceId: req.headers.get("x-elevenlabs-voice") || undefined,
  });
  return NextResponse.json(result);
}
