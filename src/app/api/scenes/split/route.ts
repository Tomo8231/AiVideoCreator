import { NextResponse } from "next/server";
import { SplitRequest } from "@/lib/api";
import { splitScript } from "@/server/ai/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/scenes/split — 台本をシーン配列に分割する（要件 3.1）。 */
export async function POST(req: Request) {
  let body: SplitRequest;
  try {
    body = (await req.json()) as SplitRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const result = await splitScript(body.script, {
    apiKey: req.headers.get("x-anthropic-key") || undefined,
  });
  return NextResponse.json(result);
}
