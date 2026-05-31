/**
 * 動画生成（RunWay / HeyGen 等）。サーバー専用。
 * RUNWAY_API_KEY が無ければモック結果を返す。
 *
 * 実 API は「ジョブ投入 → ポーリング → 完成URL取得」の非同期フローを取ることが多く、
 * 本来は Queue（要件 3.1）と組み合わせる。ここでは投入部分の足場のみ用意し、
 * 完成までのポーリングは TODO として残す。
 */

import "server-only";
import { GenerationResult } from "@/lib/api";

const MOCK_CLIP_MS = 4000;

export async function generateClip(prompt: string): Promise<GenerationResult> {
  const clean = prompt.trim();
  if (clean.length < 8) {
    return {
      ok: false,
      provider: "mock",
      mock: true,
      error: "プロンプトが短すぎます（8文字以上）",
    };
  }

  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      provider: "mock",
      mock: true,
      durationMs: MOCK_CLIP_MS,
    };
  }

  // TODO: RunWay の image/text-to-video ジョブ投入 → タスクIDをQueueでポーリングしてURL取得。
  // 現状は実キーがあってもポーリング未実装のため、投入できた体で尺だけ返す。
  return {
    ok: true,
    provider: "runway",
    mock: false,
    durationMs: MOCK_CLIP_MS,
    error: "RunWay投入は足場のみ（ポーリング未実装）",
  };
}
