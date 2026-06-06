/**
 * クライアント内モック（NEXT_PUBLIC_API_MODE=mock 用）。
 *
 * バックエンドを介さずブラウザだけで動かすときの生成シミュレータ。
 * サーバー(API Routes)が使えるときは `aiService.ts` 経由でそちらが優先される。
 * シーン分割の純粋ロジックは `sceneSplit.ts` を共用する。
 */

import { Scene } from "./types";

export { uid, splitScriptIntoScenes } from "./sceneSplit";

/** ネットワーク/生成の遅延をシミュレートする。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MockResult {
  ok: boolean;
  error?: string;
}

/**
 * 1 シーンの「動画生成」をシミュレート（要件 3.1 マルチモーダル生成）。
 * たまに失敗してリテイク導線を体験できるようにしてある。
 */
export async function generateVideo(scene: Scene): Promise<MockResult> {
  await delay(1200 + Math.random() * 2000);
  const ok = scene.videoPrompt.trim().length >= 8;
  return ok
    ? { ok }
    : { ok, error: "（モック）動画プロンプトが短すぎます（8文字以上にしてください）" };
}

/** 1 シーンの「ナレーション音声生成」をシミュレート。 */
export async function generateAudio(scene: Scene): Promise<MockResult> {
  await delay(800 + Math.random() * 1500);
  const ok = scene.subtitle.trim().length > 0;
  return ok ? { ok } : { ok, error: "（モック）字幕が空です" };
}
