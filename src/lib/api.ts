/**
 * フロント↔API Routes 間で共有する DTO 型。
 * サーバー(`src/server`)・クライアント(`src/lib/aiService.ts`)双方から import する。
 */

import { Scene, TransitionType } from "./types";

/** 単一メディア（動画 or 音声）の生成結果。 */
export interface GenerationResult {
  ok: boolean;
  /** 実際に使われたプロバイダ。"mock" のときはダミー応答。 */
  provider: string;
  /** 実APIではなくモックで返したか。 */
  mock: boolean;
  /** 生成尺（ミリ秒）。分かる場合のみ。 */
  durationMs?: number;
  /** 生成メディアの URL（data URL もしくはリモートURL）。 */
  mediaUrl?: string;
  /** 失敗時のメッセージ。 */
  error?: string;
}

// ---- /api/scenes/split ----
export interface SplitRequest {
  script: string;
}
export interface SplitResponse {
  scenes: Scene[];
  /** LLM 分割か、ヒューリスティック分割か。 */
  method: "llm" | "heuristic";
}

// ---- /api/generate/audio ----
export interface GenerateAudioRequest {
  text: string;
}

// ---- /api/generate/video ----
export interface GenerateVideoRequest {
  prompt: string;
  /** image_to_video の起点画像（URL/data URI）。任意。 */
  promptImage?: string;
  /** クリップ尺（秒）。任意。 */
  durationSec?: number;
}

// ---- /api/render ----
export interface RenderSceneInput {
  id: string;
  order: number;
  subtitle: string;
  durationMs: number;
  transition: TransitionType;
  previewColor: string;
}
export interface RenderRequest {
  title: string;
  scenes: RenderSceneInput[];
  bgmEnabled: boolean;
  duckingAmount: number;
}
export interface RenderResponse {
  ok: boolean;
  /** レンダリング済み mp4 の URL（実行できた場合）。 */
  videoUrl?: string;
  /** 実レンダリングできない環境向けの、結合プラン要約。 */
  plan: {
    totalDurationMs: number;
    sceneCount: number;
    fps: number;
    width: number;
    height: number;
  };
  rendered: boolean;
  error?: string;
}
