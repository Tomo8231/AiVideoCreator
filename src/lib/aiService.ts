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
import { useSettingsStore } from "./settingsStore";

/** 設定ストアから現在のモードを判定（mock のときはサーバーを使わない）。 */
function isServerMode(): boolean {
  return useSettingsStore.getState().apiMode !== "mock";
}

/**
 * 設定画面で入力された API キーをリクエストヘッダーに載せる。
 * 未入力のキーは送らない（サーバー側の env フォールバックに委ねる）。
 */
function buildHeaders(): Record<string, string> {
  const s = useSettingsStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (s.elevenLabsKey) headers["x-elevenlabs-key"] = s.elevenLabsKey;
  if (s.elevenLabsVoiceId) headers["x-elevenlabs-voice"] = s.elevenLabsVoiceId;
  if (s.runwayKey) headers["x-runway-key"] = s.runwayKey;
  if (s.anthropicKey) headers["x-anthropic-key"] = s.anthropicKey;
  return headers;
}

/** 台本をシーンに分割する。 */
export async function requestSplit(script: string): Promise<Scene[]> {
  if (isServerMode()) {
    try {
      const res = await fetch("/api/scenes/split", {
        method: "POST",
        headers: buildHeaders(),
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
  if (isServerMode()) {
    const r = await postGenerate("/api/generate/video", {
      prompt: scene.videoPrompt,
      promptImage: scene.seedImage,
    });
    if (r) return { ok: r.ok };
  }
  return mockVideo(scene);
}

/** シーンのナレーション音声を生成（成否のみ返す）。 */
export async function requestAudio(scene: Scene): Promise<{ ok: boolean }> {
  if (isServerMode()) {
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
  if (!isServerMode()) return null;
  try {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: buildHeaders(),
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
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, provider: "server", mock: false };
    return (await res.json()) as GenerationResult;
  } catch {
    return null; // 呼び出し側でクライアントモックへ縮退。
  }
}
