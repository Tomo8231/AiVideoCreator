/**
 * 外部 AI API のキー設定（要件 2 章・3.1）。
 *
 * 要件定義書では台本解析(LLM)・動画生成(RunWay)・音声合成(ElevenLabs) 等の
 * 外部 API をサーバー側で呼び出す。本デモ（静的ホスティング + モック）では
 * 実呼び出しは行わないが、ユーザーが「自分のキー」を設定画面から入力し、
 * この端末（localStorage）に保存できるようにしておく。
 *
 * 実 API 導入時は、ここに保存されたキーを mockApi の差し替え先（サーバー or
 * クライアント直叩き）へ渡すだけでよい。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 設定画面に出す 1 つの API キー入力欄のメタ情報。 */
export interface ApiKeyField {
  /** 保存キー（ApiKeys のプロパティ名）。 */
  id: string;
  /** 用途ラベル。 */
  label: string;
  /** 想定プロバイダ名。 */
  provider: string;
  /** 補足説明。 */
  description: string;
  /** 入力欄のプレースホルダ（キー形式の目安）。 */
  placeholder: string;
  /** キー発行ページ。 */
  docUrl: string;
  /** 必須かどうか（任意キーは未設定でも「設定済み」判定に含めない）。 */
  required: boolean;
}

/** 設定画面に並べる API キー欄の定義（要件 2 章の外部 AI API に対応）。 */
export const API_KEY_FIELDS: ApiKeyField[] = [
  {
    id: "llm",
    label: "台本解析（シーン分割）",
    provider: "OpenAI / Anthropic",
    description:
      "長文の台本をAIが「シーン（章）」ごとに自動分割するための大規模言語モデルのAPIキー。",
    placeholder: "sk-...",
    docUrl: "https://platform.openai.com/api-keys",
    required: true,
  },
  {
    id: "video",
    label: "動画生成",
    provider: "RunWay",
    description: "各シーンの映像クリップを生成する動画生成APIのキー。",
    placeholder: "key_...",
    docUrl: "https://dev.runwayml.com/",
    required: true,
  },
  {
    id: "audio",
    label: "音声合成（ナレーション）",
    provider: "ElevenLabs",
    description: "ナレーション音声を生成する音声合成APIのキー。",
    placeholder: "el_...",
    docUrl: "https://elevenlabs.io/app/settings/api-keys",
    required: true,
  },
  {
    id: "avatar",
    label: "アバター生成（任意）",
    provider: "HeyGen",
    description:
      "アバターによる解説動画も生成する場合のAPIキー。使わない場合は空のままで構いません。",
    placeholder: "hg_...",
    docUrl: "https://app.heygen.com/settings",
    required: false,
  },
];

export type ApiKeys = Record<string, string>;

interface SettingsState {
  /** 各 API キー（id -> key 文字列）。 */
  apiKeys: ApiKeys;
  /** 単一キーを更新する。 */
  setApiKey: (id: string, value: string) => void;
  /** 複数キーをまとめて更新する（設定画面の保存ボタン用）。 */
  setApiKeys: (keys: ApiKeys) => void;
  /** 全キーを消去する。 */
  clearApiKeys: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKeys: {},
      setApiKey: (id, value) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [id]: value } })),
      setApiKeys: (keys) => set({ apiKeys: { ...keys } }),
      clearApiKeys: () => set({ apiKeys: {} }),
    }),
    { name: "aivideocreator-settings" }
  )
);

/** 必須キーのうち何件が設定済みか（ホームの状態表示用）。 */
export function countConfiguredRequired(keys: ApiKeys): {
  configured: number;
  total: number;
} {
  const required = API_KEY_FIELDS.filter((f) => f.required);
  const configured = required.filter(
    (f) => (keys[f.id] ?? "").trim().length > 0
  ).length;
  return { configured, total: required.length };
}
