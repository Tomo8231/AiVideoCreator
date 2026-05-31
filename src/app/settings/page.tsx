"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  ExternalLink,
  Check,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  API_KEY_FIELDS,
  useSettingsStore,
  type ApiKeys,
} from "@/lib/apiSettings";

/**
 * API キー設定画面。
 *
 * 要件 2 章の外部 AI API（台本解析LLM / RunWay / ElevenLabs / HeyGen）の
 * キーを、ユーザーがこの端末に保存できる。レスポンシブ対応で、スマホでは
 * 1 カラム、PC では中央寄せの読みやすい幅で表示する。
 */
export default function SettingsPage() {
  const router = useRouter();
  const storedKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
  const clearApiKeys = useSettingsStore((s) => s.clearApiKeys);

  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<ApiKeys>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // localStorage の rehydrate はクライアントのみ。マウント後に下書きへ反映。
  useEffect(() => {
    setMounted(true);
    setDraft(storedKeys);
  }, [storedKeys]);

  function update(id: string, value: string) {
    setDraft((d) => ({ ...d, [id]: value }));
    setSaved(false);
  }

  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  function handleSave() {
    // 余分な空白を落として保存。
    const cleaned: ApiKeys = {};
    for (const f of API_KEY_FIELDS) {
      cleaned[f.id] = (draft[f.id] ?? "").trim();
    }
    setApiKeys(cleaned);
    setDraft(cleaned);
    setSaved(true);
  }

  function handleClear() {
    if (!confirm("保存されているAPIキーをすべて削除しますか？")) return;
    clearApiKeys();
    setDraft({});
    setRevealed({});
    setSaved(false);
  }

  if (!mounted) {
    return <div className="min-h-screen" />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 pb-16 pt-6 sm:px-6">
      {/* ヘッダー */}
      <header className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-400 transition hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="flex items-center gap-2 text-base font-bold">
          <KeyRound size={18} className="text-accent-soft" /> API設定
        </h1>
        <span className="w-12" />
      </header>

      <p className="mb-4 text-sm leading-relaxed text-gray-400">
        動画・音声の生成に使う外部AIのAPIキーを設定します。各サービスでキーを発行し、
        貼り付けてください。
      </p>

      {/* セキュリティ注意 */}
      <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-900 p-3.5">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
        <p className="text-xs leading-relaxed text-gray-400">
          入力したキーは外部に送信されず、
          <span className="font-medium text-gray-300">この端末のブラウザ内</span>
          （localStorage）にのみ保存されます。共用端末では使用後に「すべて削除」してください。
        </p>
      </div>

      {/* 入力欄 */}
      <div className="flex flex-col gap-5">
        {API_KEY_FIELDS.map((field) => {
          const value = draft[field.id] ?? "";
          const isSet = value.trim().length > 0;
          const show = revealed[field.id] ?? false;
          return (
            <div
              key={field.id}
              className="flex flex-col gap-2 rounded-2xl border border-ink-700 bg-ink-800/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{field.label}</span>
                  {field.required ? (
                    <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] text-gray-300">
                      必須
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] text-gray-400">
                      任意
                    </span>
                  )}
                  {isSet && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      <Check size={10} /> 設定済み
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-500">{field.provider}</span>
              </div>

              <p className="text-xs leading-relaxed text-gray-500">
                {field.description}
              </p>

              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => update(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 pr-10 font-mono text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => toggleReveal(field.id)}
                    aria-label={show ? "キーを隠す" : "キーを表示"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition hover:text-gray-300"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Link
                href={field.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-[11px] text-accent-soft hover:underline"
              >
                <ExternalLink size={11} /> キーを発行する
              </Link>
            </div>
          );
        })}
      </div>

      {/* 保存／削除 */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-soft sm:flex-1"
        >
          {saved ? <Check size={16} /> : <KeyRound size={16} />}
          {saved ? "保存しました" : "保存する"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-4 py-3 text-sm text-red-400 transition hover:border-red-500/40 hover:text-red-300"
        >
          <Trash2 size={15} /> すべて削除
        </button>
      </div>

      {saved && (
        <p className="mt-3 text-center text-xs text-emerald-400">
          この端末にAPIキーを保存しました。
        </p>
      )}
    </main>
  );
}
