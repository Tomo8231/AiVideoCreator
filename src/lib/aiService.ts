/**
 * フロントからの生成リクエストの単一窓口。
 *
 * NEXT_PUBLIC_API_MODE に応じて経路を切り替える:
 *   "server"(既定) … /api/* を叩く（バックエンド利用）。失敗時はクライアントモックへ縮退。
 *   "mock"          … サーバーを介さずブラウザ内モックで完結（静的配信向け）。
 *
 * これによりストア/コンポーネントは経路を意識せず「意図」だけを呼べる。
 */

import { Scene } from "./types";
import {
  GenerationResult,
  RenderRequest,
  RenderResponse,
  SplitResponse,
} from "./api";
import { splitScriptIntoScenes } from "./sceneSplit";
import {
  generateAudio as mockAudio,
  generateVideo as mockVideo,
} from "./mockApi";

const MODE = process.env.NEXT_PUBLIC_API_MODE ?? "server";
const useServer = MODE !== "mock";

/** 台本をシーンに分割する。 */
export async function requestSplit(script: string): Promise<Scene[]> {
  if (useServer) {
    try {
      const res = await fetch("/api/scenes/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      if (res.ok) {
        const data = (await res.json()) as SplitResponse;
        return data.scenes;
      }
    } catch {
      // ネットワーク不通などはクライアント分割へ縮退。
    }
  }
  return splitScriptIntoScenes(script);
}

/** シーンの動画クリップを生成（成否のみ返す）。 */
export async function requestVideo(scene: Scene): Promise<{ ok: boolean }> {
  if (useServer) {
    const r = await postGenerate("/api/generate/video", {
      prompt: scene.videoPrompt,
    });
    if (r) return { ok: r.ok };
  }
  return mockVideo(scene);
}

/** シーンのナレーション音声を生成（成否のみ返す）。 */
export async function requestAudio(scene: Scene): Promise<{ ok: boolean }> {
  if (useServer) {
    const r = await postGenerate("/api/generate/audio", {
      text: scene.subtitle,
    });
    if (r) return { ok: r.ok };
  }
  return mockAudio(scene);
}

/** Remotion 結合（mp4 書き出し）をサーバーに依頼する。 */
export async function requestRender(
  body: RenderRequest
): Promise<RenderResponse | null> {
  if (!useServer) return null;
  try {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as RenderResponse;
  } catch {
    return null;
  }
}

async function postGenerate(
  url: string,
  payload: unknown
): Promise<GenerationResult | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, provider: "server", mock: false };
    return (await res.json()) as GenerationResult;
  } catch {
    return null; // 呼び出し側でクライアントモックへ縮退。
  }
}
