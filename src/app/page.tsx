"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Clapperboard,
  Sparkles,
  FileText,
  Loader2,
  Settings,
  ListVideo,
} from "lucide-react";
import { SAMPLE_SCRIPT } from "@/lib/sampleScript";
import { createJob } from "@/lib/jobsClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SeedImagePicker } from "@/components/SeedImagePicker";

/**
 * 台本＋画像をサーバーに投入する画面（モバイルWeb）。
 * 生成は PC サーバー側で非同期に進み、投入後はジョブ状況画面へ遷移する。
 */
export default function HomePage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [seedImage, setSeedImage] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!script.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createJob({
        title,
        script,
        defaultImage: seedImage,
      });
      router.push(`/jobs/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "投入に失敗しました");
      setSubmitting(false);
    }
  }

  const charCount = script.length;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-8">
      <header className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent-soft">
          <Clapperboard size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">AIVideoCreator</h1>
          <p className="text-xs text-gray-400">台本を送ると、サーバーが生成します</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className="p-2 text-gray-400 hover:text-gray-200"
          aria-label="ジョブ履歴"
        >
          <ListVideo size={20} />
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="p-2 text-gray-400 hover:text-gray-200"
          aria-label="設定"
        >
          <Settings size={20} />
        </button>
      </header>

      <section className="flex flex-1 flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-300">タイトル</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 雲海の山旅"
            className="rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">台本</span>
            <button
              type="button"
              onClick={() => setScript(SAMPLE_SCRIPT)}
              className="inline-flex items-center gap-1 text-xs text-accent-soft hover:underline"
            >
              <FileText size={13} /> サンプルを挿入
            </button>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="ここに台本を貼り付け。サーバー側でシーン分割→画像/動画・音声を生成します。"
            className="min-h-[220px] flex-1 resize-none rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-accent thin-scroll"
          />
          <span className="self-end text-[11px] text-gray-500">{charCount} 文字</span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-300">
            起点画像（任意・全シーン共通）
          </span>
          <SeedImagePicker
            value={seedImage}
            onChange={setSeedImage}
            hint="ComfyUI/RunWay の生成のもとになる画像。未添付でもモック生成は動作します。"
          />
        </div>

        {error && <p className="text-[13px] text-red-400">{error}</p>}

        <button
          type="button"
          disabled={!script.trim() || submitting}
          onClick={handleSubmit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Sparkles size={17} />
          )}
          {submitting ? "サーバーへ投入中…" : "サーバーで生成する"}
        </button>
        <p className="text-center text-[11px] leading-relaxed text-gray-500">
          投入後は状況画面に移動します。生成は PC サーバーで進み、スマホを閉じても継続します。
        </p>
      </section>
    </main>
  );
}
