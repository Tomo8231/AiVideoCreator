/**
 * 台本のシーン分割（要件 3.1）。サーバー専用。
 * ANTHROPIC_API_KEY があれば Claude で意味的に分割し、無ければヒューリスティック。
 */

import "server-only";
import { Scene } from "@/lib/types";
import { buildScenes, heuristicSplit } from "@/lib/sceneSplit";

export async function splitScript(
  script: string
): Promise<{ scenes: Scene[]; method: "llm" | "heuristic" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const chunks = await llmSplit(script, apiKey);
      if (chunks.length > 0) {
        return { scenes: buildScenes(chunks), method: "llm" };
      }
    } catch {
      // LLM 失敗時はヒューリスティックにフォールバック。
    }
  }
  return { scenes: buildScenes(heuristicSplit(script)), method: "heuristic" };
}

/** Claude にチャプタリングさせ、シーンごとのテキスト配列を得る。 */
async function llmSplit(script: string, apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system:
        "あなたは動画の絵コンテ設計者です。与えられた台本を、映像のシーン（章）" +
        "ごとに分割します。各シーンは2〜6秒のナレーションに収まる長さが目安。" +
        '出力は JSON 配列のみ（例: ["シーン1の文","シーン2の文"]）。説明文は不要。',
      messages: [{ role: "user", content: script }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => String(x).trim()).filter(Boolean);
}
