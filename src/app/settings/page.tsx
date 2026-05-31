"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, Check, Trash2 } from "lucide-react";
import { ApiMode, useSettingsStore } from "@/lib/settingsStore";
import { KeyField } from "@/components/KeyField";

export default function SettingsPage() {
  const router = useRouter();
  const settings = useSettingsStore();

  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  // localStorage 永続化の rehydrate はクライアントのみ。
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="min-h-screen" />;

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="ml-1 text-lg font-bold">設定</h1>
      </header>

      {/* API モード */}
      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          生成モード
        </h2>
        <div className="flex gap-2">
          {(["server", "mock"] as ApiMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                settings.setApiMode(mode);
                flashSaved();
              }}
              className={`flex-1 rounded-xl border px-3 py-3 text-left transition ${
                settings.apiMode === mode
                  ? "border-accent bg-ink-800"
                  : "border-ink-700 bg-ink-900 hover:border-ink-600"
              }`}
            >
              <div className="text-sm font-semibold">
                {mode === "server" ? "サーバー" : "モック"}
              </div>
              <div className="text-[11px] leading-snug text-gray-400">
                {mode === "server"
                  ? "API Routesで生成（キーがあれば実API）"
                  : "ブラウザ内ダミーで動作（キー不要）"}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* API キー */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          API キー
        </h2>

        <KeyField
          label="ElevenLabs API キー（音声合成）"
          value={settings.elevenLabsKey}
          placeholder="未入力ならモック音声"
          hint="elevenlabs.io で取得。ナレーション音声の生成に使用。"
          onChange={(v) => settings.update({ elevenLabsKey: v })}
        />
        <KeyField
          label="ElevenLabs ボイスID（任意）"
          value={settings.elevenLabsVoiceId}
          placeholder="未入力ならデフォルトボイス"
          onChange={(v) => settings.update({ elevenLabsVoiceId: v })}
        />
        <KeyField
          label="RunWay API キー（動画生成）"
          value={settings.runwayKey}
          placeholder="未入力ならモック動画"
          hint="シーンごとの動画クリップ生成に使用。"
          onChange={(v) => settings.update({ runwayKey: v })}
        />
        <KeyField
          label="Anthropic API キー（台本のシーン分割）"
          value={settings.anthropicKey}
          placeholder="未入力ならヒューリスティック分割"
          hint="台本を Claude で意味的にチャプタリングする場合に使用。"
          onChange={(v) => settings.update({ anthropicKey: v })}
        />

        <button
          type="button"
          onClick={flashSaved}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-soft"
        >
          {saved ? <Check size={16} /> : null}
          {saved ? "保存しました" : "保存"}
        </button>
        <p className="text-center text-[11px] text-gray-500">
          入力は自動的にこの端末に保存されます。
        </p>

        <button
          type="button"
          onClick={() => {
            settings.clearKeys();
            flashSaved();
          }}
          className="inline-flex items-center justify-center gap-1.5 self-center text-xs text-red-400 hover:text-red-300"
        >
          <Trash2 size={13} /> キーをすべて消去
        </button>
      </section>

      {/* セキュリティ注意 */}
      <div className="mt-6 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200/90">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p className="text-[11px] leading-relaxed">
          入力したキーはブラウザ（localStorage）に保存され、生成時に自前サーバー（API
          Routes）へヘッダーで送信されます。<strong>共有端末では入力しない</strong>でください。
          サーバー側の環境変数にキーを設定する運用なら、ここは空のままで構いません
          （その場合はサーバーの env が使われます）。
        </p>
      </div>
    </main>
  );
}
