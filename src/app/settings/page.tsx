"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, Check, Trash2 } from "lucide-react";
import { ApiMode, VideoProvider, useSettingsStore } from "@/lib/settingsStore";
import { KeyField } from "@/components/KeyField";
import { useAuthStore } from "@/lib/authStore";
import { useThemeStore, Theme } from "@/lib/themeStore";
import {
  LogIn,
  LogOut,
  FolderOpen,
  ExternalLink,
  Moon,
  Sun,
  Cpu,
} from "lucide-react";

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

      {/* 外観（テーマ） */}
      <AppearanceSection />

      {/* アカウント（Supabase） */}
      <AccountSection />

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
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            API キー
          </h2>
          <a
            href="/api-keys-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent-soft hover:underline"
          >
            キーの取得方法 <ExternalLink size={12} />
          </a>
        </div>

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

      {/* 動画プロバイダ（ComfyUI） */}
      <ComfyUISection onSaved={flashSaved} />

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

/** 動画生成プロバイダ（RunWay / ローカル ComfyUI）の設定。 */
function ComfyUISection({ onSaved }: { onSaved: () => void }) {
  const provider = useSettingsStore((s) => s.videoProvider);
  const comfyUiUrl = useSettingsStore((s) => s.comfyUiUrl);
  const comfyUiWorkflow = useSettingsStore((s) => s.comfyUiWorkflow);
  const setVideoProvider = useSettingsStore((s) => s.setVideoProvider);
  const update = useSettingsStore((s) => s.update);

  const options: { value: VideoProvider; label: string; desc: string }[] = [
    { value: "runway", label: "RunWay", desc: "クラウド（従量課金）" },
    { value: "comfyui", label: "ComfyUI", desc: "ローカル（無料・自前PC）" },
  ];

  return (
    <section className="mb-5 flex flex-col gap-3">
      <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Cpu size={13} /> 動画生成プロバイダ
      </h2>

      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setVideoProvider(opt.value);
              onSaved();
            }}
            className={`flex-1 rounded-xl border px-3 py-3 text-left transition ${
              provider === opt.value
                ? "border-accent bg-ink-800"
                : "border-ink-700 bg-ink-900 hover:border-ink-600"
            }`}
          >
            <div className="text-sm font-semibold">{opt.label}</div>
            <div className="text-[11px] leading-snug text-gray-400">{opt.desc}</div>
          </button>
        ))}
      </div>

      {provider === "comfyui" && (
        <div className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-300">ComfyUI のURL</span>
            <input
              value={comfyUiUrl}
              onChange={(e) => update({ comfyUiUrl: e.target.value })}
              placeholder="http://127.0.0.1:8188"
              spellCheck={false}
              className="rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-300">
              ワークフロー（API形式JSON）
            </span>
            <textarea
              value={comfyUiWorkflow}
              onChange={(e) => update({ comfyUiWorkflow: e.target.value })}
              placeholder='ComfyUI の「Save (API Format)」で書き出したJSONを貼り付け。プロンプト欄に %PROMPT%、画像読み込みノードのファイル名に %IMAGE%、seed に %SEED% を入れておくと差し込まれます。'
              spellCheck={false}
              className="min-h-[140px] resize-y rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed outline-none focus:border-accent thin-scroll"
            />
          </label>

          <button
            type="button"
            onClick={onSaved}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            保存
          </button>

          <p className="text-[11px] leading-relaxed text-gray-500">
            ※ ローカルの ComfyUI に接続するため、<strong>このアプリも同じPCで起動</strong>
            してください（サーバー側から {comfyUiUrl || "127.0.0.1:8188"} へ接続）。
            プレースホルダ: <code>%PROMPT%</code>（プロンプト）/ <code>%IMAGE%</code>
            （起点画像のファイル名）/ <code>%SEED%</code>（乱数seed）。
          </p>
        </div>
      )}
    </section>
  );
}

/** 外観（ダーク/ライト）の切り替え。 */
function AppearanceSection() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const sync = useThemeStore((s) => s.sync);
  useEffect(() => sync(), [sync]);

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "dark", label: "ダーク", icon: <Moon size={15} /> },
    { value: "light", label: "ライト", icon: <Sun size={15} /> },
  ];

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        外観
      </h2>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
              theme === opt.value
                ? "border-accent bg-ink-800"
                : "border-ink-700 bg-ink-900 hover:border-ink-600"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** アカウント（ログイン状態・サインアウト・クラウドプロジェクトへの導線）。 */
function AccountSection() {
  const router = useRouter();
  const { configured, loading, user, signOut } = useAuthStore();

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        アカウント
      </h2>
      <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
        {!configured ? (
          <p className="text-[12px] leading-relaxed text-gray-400">
            Supabase 未設定です。<code>NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            を設定するとログインとクラウド保存が有効になります。
          </p>
        ) : loading ? (
          <p className="text-[12px] text-gray-500">確認中…</p>
        ) : user ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm">
              <span className="text-gray-400">ログイン中: </span>
              <span className="font-medium">{user.email ?? user.id}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/projects")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs text-gray-200 hover:border-ink-600"
              >
                <FolderOpen size={14} /> クラウドのプロジェクト
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs text-red-400 hover:border-red-500/50"
              >
                <LogOut size={14} /> ログアウト
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-soft"
          >
            <LogIn size={16} /> ログイン / 新規登録
          </button>
        )}
      </div>
    </section>
  );
}
