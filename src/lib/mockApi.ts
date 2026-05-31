/**
 * AI バックエンドのモック実装。
 *
 * 要件定義書では台本解析・動画生成(RunWay)・音声合成(ElevenLabs)・Remotion 結合を
 * サーバー側で行うが、GitHub Pages（静的ホスティング）では実行できない。
 * ここではそれらを「それっぽい遅延を伴う Promise」として再現し、UI とフローを
 * 完成させる。実 API 導入時はこのファイルだけを差し替えればよい。
 */

import { Scene, TransitionType } from "./types";

/** 簡易 ID 生成（crypto が無い環境でも動くフォールバック付き）。 */
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

function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

/**
 * 台本をシーン（章）に自動分割する（要件 3.1）。
 *
 * 実装ではここで LLM に投げて意味的にチャプタリングするが、モックでは
 * 「空行区切り → それも無ければ句点区切り」というヒューリスティクスで分割する。
 */
export function splitScriptIntoScenes(script: string): Scene[] {
  const trimmed = script.trim();
  if (!trimmed) return [];

  // まず空行（段落）で分割。段落が 1 つしか無ければ句点で分割する。
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

  // 細かすぎる断片は隣とまとめ、おおよそ 1 シーン 40 文字以上を目安にする。
  const merged: string[] = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && merged[merged.length - 1].length < 40) {
      merged[merged.length - 1] += chunk;
    } else {
      merged.push(chunk);
    }
  }

  return merged.map((text, i) => ({
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

/** ナレーション尺の推定。日本語は 1 文字 ≈ 150ms 程度を目安にする。 */
function estimateDurationMs(text: string): number {
  const perChar = 150;
  const min = 2000;
  return Math.max(min, Math.round(text.length * perChar));
}

/** 台本テキストから素朴な動画プロンプトの初期値を作る。 */
function defaultVideoPrompt(text: string): string {
  const head = text.slice(0, 24).replace(/\s+/g, " ");
  return `cinematic vertical 9:16 shot, ${head}…`;
}

/** ネットワーク/生成の遅延をシミュレートする。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1 シーンの「動画生成」をシミュレート（要件 3.1 マルチモーダル生成）。
 * たまに失敗してリテイク導線を体験できるようにしてある。
 */
export async function generateVideo(scene: Scene): Promise<{ ok: boolean }> {
  await delay(1200 + Math.random() * 2000);
  // プロンプトが極端に短い場合は失敗扱い（リテイク体験用）。
  const ok = scene.videoPrompt.trim().length >= 8;
  return { ok };
}

/** 1 シーンの「ナレーション音声生成」をシミュレート。 */
export async function generateAudio(scene: Scene): Promise<{ ok: boolean }> {
  await delay(800 + Math.random() * 1500);
  const ok = scene.subtitle.trim().length > 0;
  return { ok };
}
