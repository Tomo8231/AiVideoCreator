import { NextResponse } from "next/server";
import path from "node:path";
import { RenderRequest, RenderResponse } from "@/lib/api";
import { FPS, WIDTH, HEIGHT } from "@/remotion/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Remotion レンダリングは時間がかかるため上限を引き上げる。
export const maxDuration = 300;

/**
 * POST /api/render — シーン群を Remotion で 1 本の mp4 に結合する（要件 3.2）。
 *
 * @remotion/renderer は Chromium ヘッドレスを必要とする。実行環境に無い場合は
 * 実レンダリングをスキップし、結合プランの要約だけを返す（rendered:false）。
 */
export async function POST(req: Request) {
  let body: RenderRequest;
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const scenes = body.scenes ?? [];
  const totalMs = scenes.reduce((sum, s) => sum + s.durationMs, 0);
  const plan: RenderResponse["plan"] = {
    totalDurationMs: totalMs,
    sceneCount: scenes.length,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
  };

  if (scenes.length === 0) {
    return NextResponse.json<RenderResponse>(
      { ok: false, plan, rendered: false, error: "シーンがありません" },
      { status: 400 }
    );
  }

  try {
    const videoUrl = await renderWithRemotion(body, totalMs);
    return NextResponse.json<RenderResponse>({
      ok: true,
      plan,
      rendered: true,
      videoUrl,
    });
  } catch (e) {
    // Chromium 未導入などで失敗 → プランのみ返す（アプリは継続動作）。
    return NextResponse.json<RenderResponse>({
      ok: true,
      plan,
      rendered: false,
      error:
        e instanceof Error
          ? `実レンダリング不可（プランのみ返却）: ${e.message}`
          : "実レンダリング不可",
    });
  }
}

/** Remotion で実際に mp4 を書き出し、配信用 URL を返す。 */
async function renderWithRemotion(
  body: RenderRequest,
  totalMs: number
): Promise<string> {
  // 重量級依存は遅延 import（ビルド・通常APIに巻き込まない）。
  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, renderMedia } = await import(
    "@remotion/renderer"
  );
  const { mkdir } = await import("node:fs/promises");

  const inputProps = {
    title: body.title,
    bgmEnabled: body.bgmEnabled,
    duckingAmount: body.duckingAmount,
    scenes: body.scenes.map((s) => ({
      id: s.id,
      subtitle: s.subtitle,
      durationInFrames: Math.max(1, Math.round((s.durationMs / 1000) * FPS)),
      transition: s.transition,
      color: s.previewColor,
    })),
  };

  const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
  const serveUrl = await bundle({ entryPoint: entry });
  const composition = await selectComposition({
    serveUrl,
    id: "MainVideo",
    inputProps,
  });

  const outDir = path.join(process.cwd(), "public", "renders");
  await mkdir(outDir, { recursive: true });
  const fileName = `${Date.now()}.mp4`;
  const outputLocation = path.join(outDir, fileName);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
  });

  void totalMs;
  return `/renders/${fileName}`;
}
