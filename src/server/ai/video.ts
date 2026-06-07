/**
 * 動画生成（RunWay）。サーバー専用。
 * RUNWAY_API_KEY が無ければモック結果を返す（キー無しでも動く）。
 *
 * 実キーがある場合は image_to_video タスクを作成し、完成まで `tasks/{id}` を
 * ポーリングして成果物URLを取得する（要件 3.1 のマルチモーダル非同期生成）。
 */

import "server-only";
import { GenerationResult } from "@/lib/api";
import {
  RunwayError,
  createImageToVideoTask,
  pollTask,
} from "./runway";
import { ComfyUIError, runWorkflow } from "./comfyui";

const MOCK_CLIP_MS = 4000;
const DEFAULT_DURATION_SEC = 5;

export type VideoProvider = "runway" | "comfyui";

export interface VideoOptions {
  /** 使用するプロバイダ。未指定なら env から推定（既定は runway）。 */
  provider?: VideoProvider;
  apiKey?: string;
  /** image_to_video の起点画像（URL/data URI）。未指定なら env のデフォルトを使う。 */
  promptImage?: string;
  durationSec?: number;
  /** "768:1280"（縦）など。 */
  ratio?: string;
  /** ComfyUI のベースURL（例: http://127.0.0.1:8188）。 */
  comfyUiUrl?: string;
  /** ComfyUI の API 形式ワークフローJSON。 */
  comfyUiWorkflow?: string;
  signal?: AbortSignal;
}

export async function generateClip(
  prompt: string,
  opts: VideoOptions = {}
): Promise<GenerationResult> {
  const clean = prompt.trim();
  if (clean.length < 8) {
    return {
      ok: false,
      provider: "mock",
      mock: true,
      error: "プロンプトが短すぎます（8文字以上）",
    };
  }

  // プロバイダ決定: 明示指定 > env(COMFYUI) > runway。
  const provider: VideoProvider =
    opts.provider ?? (process.env.COMFYUI_BASE_URL ? "comfyui" : "runway");

  if (provider === "comfyui") {
    return generateWithComfyUI(clean, opts);
  }

  const apiKey = opts.apiKey || process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      provider: "mock",
      mock: true,
      durationMs: MOCK_CLIP_MS,
    };
  }

  // image_to_video は起点画像が必須。UI からの指定が無ければ env のデフォルト。
  const promptImage = opts.promptImage || process.env.RUNWAY_DEFAULT_IMAGE;
  if (!promptImage) {
    return {
      ok: false,
      provider: "runway",
      mock: false,
      error:
        "RunWay の動画生成には起点画像が必要です（promptImage か RUNWAY_DEFAULT_IMAGE を指定）",
    };
  }

  const durationSec = opts.durationSec ?? DEFAULT_DURATION_SEC;

  try {
    const taskId = await createImageToVideoTask({
      apiKey,
      promptText: clean,
      promptImage,
      durationSec,
      ratio: opts.ratio,
      signal: opts.signal,
    });

    const task = await pollTask(taskId, {
      apiKey,
      intervalMs: numEnv("RUNWAY_POLL_INTERVAL_MS", 5000),
      timeoutMs: numEnv("RUNWAY_POLL_TIMEOUT_MS", 5 * 60_000),
      signal: opts.signal,
    });

    const url = task.output?.[0];
    if (!url) {
      return {
        ok: false,
        provider: "runway",
        mock: false,
        error: "タスクは成功しましたが出力URLが空でした",
      };
    }

    return {
      ok: true,
      provider: "runway",
      mock: false,
      mediaUrl: url,
      durationMs: durationSec * 1000,
    };
  } catch (e) {
    const msg =
      e instanceof RunwayError
        ? e.message
        : e instanceof Error
          ? e.message
          : "RunWay 生成に失敗しました";
    return { ok: false, provider: "runway", mock: false, error: msg };
  }
}

/** ローカル ComfyUI で動画を生成する。 */
async function generateWithComfyUI(
  prompt: string,
  opts: VideoOptions
): Promise<GenerationResult> {
  const baseUrl = opts.comfyUiUrl || process.env.COMFYUI_BASE_URL;
  const workflowJson = opts.comfyUiWorkflow || process.env.COMFYUI_WORKFLOW;
  if (!baseUrl) {
    return {
      ok: false,
      provider: "comfyui",
      mock: false,
      error: "ComfyUI のURLが未設定です（例: http://127.0.0.1:8188）",
    };
  }
  if (!workflowJson) {
    return {
      ok: false,
      provider: "comfyui",
      mock: false,
      error:
        "ComfyUI のワークフロー(API形式JSON)が未設定です。設定画面に貼り付けてください",
    };
  }

  try {
    const { mediaUrl } = await runWorkflow({
      baseUrl,
      workflowJson,
      prompt,
      image: opts.promptImage,
      intervalMs: numEnv("COMFYUI_POLL_INTERVAL_MS", 2000),
      timeoutMs: numEnv("COMFYUI_POLL_TIMEOUT_MS", 10 * 60_000),
      signal: opts.signal,
    });
    return { ok: true, provider: "comfyui", mock: false, mediaUrl };
  } catch (e) {
    const msg =
      e instanceof ComfyUIError
        ? e.message
        : e instanceof Error
          ? e.message
          : "ComfyUI 生成に失敗しました";
    return { ok: false, provider: "comfyui", mock: false, error: msg };
  }
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
