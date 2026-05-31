/**
 * 台本→シーン分割の純粋ロジック（要件 3.1）。
 * サーバー(API Route)・クライアント(モック)双方から再利用する。
 */

import { Scene, TransitionType } from "./types";

/** 簡易 ID 生成（Node / ブラウザ両対応）。 */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const PALETTE = [
  "#7c5cff",
  "#ff6b6b",
  "#2dd4bf",
  "#fbbf24",
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#a78bfa",
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

/** ナレーション尺の推定。日本語は 1 文字 ≈ 150ms 程度を目安にする。 */
export function estimateDurationMs(text: string): number {
  const perChar = 150;
  const min = 2000;
  return Math.max(min, Math.round(text.length * perChar));
}

/** 台本テキストから素朴な動画プロンプトの初期値を作る。 */
export function defaultVideoPrompt(text: string): string {
  const head = text.slice(0, 24).replace(/\s+/g, " ");
  return `cinematic vertical 9:16 shot, ${head}…`;
}

/** 分割済みのテキスト断片配列から Scene[] を組み立てる。 */
export function buildScenes(chunks: string[]): Scene[] {
  return chunks.map((text, i) => ({
    id: uid(),
    order: i,
    scriptText: text,
    videoPrompt: defaultVideoPrompt(text),
    subtitle: text,
    durationMs: estimateDurationMs(text),
    trimStartMs: 0,
    transition: (i === 0 ? "none" : "dissolve") as TransitionType,
    videoStatus: "pending",
    audioStatus: "pending",
    previewColor: colorForIndex(i),
  }));
}

/**
 * ヒューリスティックなチャプタリング。
 * 空行（段落）優先 → 単一段落なら句点で分割 → 短すぎる断片は隣と結合。
 */
export function heuristicSplit(script: string): string[] {
  const trimmed = script.trim();
  if (!trimmed) return [];

  let chunks = trimmed
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (chunks.length <= 1) {
    chunks = trimmed
      .split(/(?<=[。.!?！？])/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const merged: string[] = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && merged[merged.length - 1].length < 40) {
      merged[merged.length - 1] += chunk;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

/** 台本をシーン配列に変換（ヒューリスティック）。 */
export function splitScriptIntoScenes(script: string): Scene[] {
  return buildScenes(heuristicSplit(script));
}
