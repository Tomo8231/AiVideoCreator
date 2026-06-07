/**
 * サーバー側ジョブの DTO（スマホ↔サーバー間で共有）。
 *
 * スマホは台本＋画像を投入（POST /api/jobs）して id を受け取り、
 * GET /api/jobs/{id} をポーリングして進捗・成果物を確認する。
 * 生成自体は PC サーバー側で非同期に実行される（要件 3.1 のQueue相当）。
 */

import { GenerationStatus } from "./types";

export type JobState = "queued" | "running" | "completed" | "failed";

export interface JobSceneDTO {
  id: string;
  order: number;
  scriptText: string;
  subtitle: string;
  videoPrompt: string;
  videoStatus: GenerationStatus;
  audioStatus: GenerationStatus;
  videoError?: string;
  audioError?: string;
  /** 生成物のURL（ComfyUI の /view など）。 */
  videoUrl?: string;
  audioUrl?: string;
}

export interface JobDTO {
  id: string;
  title: string;
  state: JobState;
  createdAt: number;
  updatedAt: number;
  scenes: JobSceneDTO[];
  /** ジョブ全体の致命的エラー（分割失敗など）。 */
  error?: string;
  progress: { done: number; total: number };
}

/** 一覧表示用の軽量サマリ。 */
export interface JobSummary {
  id: string;
  title: string;
  state: JobState;
  createdAt: number;
  updatedAt: number;
  progress: { done: number; total: number };
}

// ---- POST /api/jobs ----
export interface CreateJobRequest {
  title?: string;
  script: string;
  /** 全シーン共通の起点画像（data URL もしくは URL）。任意。 */
  defaultImage?: string;
  /** シーン順に対応する起点画像（指定があれば defaultImage より優先）。任意。 */
  images?: string[];
}
export interface CreateJobResponse {
  id: string;
}

/** 完了シーン数（映像・音声の両方が終わったシーン）を数える。 */
export function countDoneScenes(scenes: JobSceneDTO[]): number {
  return scenes.filter(
    (s) =>
      s.videoStatus !== "pending" &&
      s.videoStatus !== "generating" &&
      s.audioStatus !== "pending" &&
      s.audioStatus !== "generating"
  ).length;
}
