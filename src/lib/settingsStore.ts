/**
 * アプリ設定（APIキー・APIモード）を保持する Zustand ストア。
 *
 * キーはブラウザの localStorage に保存し、生成リクエスト時にヘッダー経由で
 * 自前の API Routes へ渡す（サーバーはこれを env より優先して使う）。
 * これにより Vercel 等の環境変数設定なしでも実 API を利用できる。
 *
 * 注意: この方式はキーをブラウザに保存するため、共有端末では使わないこと。
 * サーバー側 env に設定されたキーを使う運用なら、ここは空のままでよい。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ApiMode = "server" | "mock";

/** ビルド時 env を既定値に。未指定なら server。 */
const DEFAULT_MODE: ApiMode =
  process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "server";

export interface SettingsState {
  apiMode: ApiMode;
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
  runwayKey: string;
  anthropicKey: string;

  setApiMode: (mode: ApiMode) => void;
  update: (patch: Partial<Omit<SettingsState, "setApiMode" | "update" | "clearKeys">>) => void;
  clearKeys: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiMode: DEFAULT_MODE,
      elevenLabsKey: "",
      elevenLabsVoiceId: "",
      runwayKey: "",
      anthropicKey: "",

      setApiMode: (mode) => set({ apiMode: mode }),
      update: (patch) => set(patch),
      clearKeys: () =>
        set({
          elevenLabsKey: "",
          elevenLabsVoiceId: "",
          runwayKey: "",
          anthropicKey: "",
        }),
    }),
    { name: "aivideocreator-settings" }
  )
);
