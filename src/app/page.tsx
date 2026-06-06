"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clapperboard, Sparkles, FileText, Loader2, Settings } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { SAMPLE_SCRIPT } from "@/lib/sampleScript";
import { StatusBadge } from "@/components/StatusBadge";
import { ThemeToggle } from "@/components/ThemeToggle";

type Phase = "input" | "generating";

export default function HomePage() {
  const router = useRouter();
  const project = useAppStore((s) => s.project);
  const createProjectFromScript = useAppStore((s) => s.createProjectFromScript);
  const generateAll = useAppStore((s) => s.generateAll);
  const resetProject = useAppStore((s) => s.resetProject);

  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [splitting, setSplitting] = useState(false);

  const sceneCount = project?.scenes.length ?? 0;

  async function handleGenerate() {
    if (!script.trim() || splitting) return;
    setSplitting(true);
    try {
      await createProjectFromScript(title, script);
    } finally {
      setSplitting(false);
    }
    setPhase("generating");
    await generateAll();
  }

  function startOver() {
    resetProject();
    setPhase("input");
    setTitle("");
    setScript("");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-8">
      <header className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent-soft">
          <Clapperboard size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">AIVideoCreator</h1>
          <p className="text-xs text-gray-400">台本から、AIが動画を生成・結合</p>
        </div>
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

      {phase === "input" && (
        <InputPhase
          title={title}
          script={script}
          busy={splitting}
          onTitle={setTitle}
          onScript={setScript}
          onUseSample={() => setScript(SAMPLE_SCRIPT)}
          onGenerate={handleGenerate}
        />
      )}

      {phase === "generating" && project && (
        <GeneratingPhase
          sceneCount={sceneCount}
          onOpenEditor={() => router.push("/editor")}
          onStartOver={startOver}
        />
      )}
    </main>
  );
}

function InputPhase({
  title,
  script,
  busy,
  onTitle,
  onScript,
  onUseSample,
  onGenerate,
}: {
  title: string;
  script: string;
  busy: boolean;
  onTitle: (v: string) => void;
  onScript: (v: string) => void;
  onUseSample: () => void;
  onGenerate: () => void;
}) {
  const charCount = script.length;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-300">タイトル</span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="例: 雲海の山旅"
          className="rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">台本</span>
          <button
            type="button"
            onClick={onUseSample}
            className="inline-flex items-center gap-1 text-xs text-accent-soft hover:underline"
          >
            <FileText size={13} /> サンプルを挿入
          </button>
        </div>
        <textarea
          value={script}
          onChange={(e) => onScript(e.target.value)}
          placeholder="ここに長文の台本を貼り付けてください。AIがシーン（章）ごとに自動分割します。"
          className="min-h-[260px] flex-1 resize-none rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-accent thin-scroll"
        />
        <span className="self-end text-[11px] text-gray-500">{charCount} 文字</span>
      </label>

      <button
        type="button"
        disabled={!script.trim() || busy}
        onClick={onGenerate}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Sparkles size={17} />
        )}
        {busy ? "台本を解析中…" : "解析して動画を生成"}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-gray-500">
        ※ デモ版：動画/音声生成はモックです。台本分割・タイムライン編集・字幕修正・
        部分再生成のUIフローを体験できます。
      </p>
    </section>
  );
}

function GeneratingPhase({
  sceneCount,
  onOpenEditor,
  onStartOver,
}: {
  sceneCount: number;
  onOpenEditor: () => void;
  onStartOver: () => void;
}) {
  const scenes = useAppStore((s) => s.project?.scenes ?? []);
  const allDone = scenes.every(
    (s) => s.videoStatus !== "generating" && s.audioStatus !== "generating"
  );
  const readyCount = scenes.filter(
    (s) => s.videoStatus === "ready" && s.audioStatus === "ready"
  ).length;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="mb-3 flex items-center gap-2">
          {allDone ? (
            <Sparkles size={18} className="text-emerald-400" />
          ) : (
            <Loader2 size={18} className="animate-spin text-accent-soft" />
          )}
          <h2 className="text-sm font-semibold">
            {allDone
              ? `生成完了（${readyCount}/${sceneCount} シーン）`
              : `${sceneCount} シーンを並列生成中…`}
          </h2>
        </div>
        <ul className="flex flex-col gap-2">
          {scenes.map((scene) => (
            <li
              key={scene.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-ink-800 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-7 w-7 shrink-0 rounded-md"
                  style={{ background: scene.previewColor }}
                />
                <span className="truncate text-xs text-gray-300">
                  #{scene.order + 1} {scene.scriptText}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <StatusBadge status={scene.videoStatus} label="映像" />
                <StatusBadge status={scene.audioStatus} label="音声" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          disabled={!allDone}
          onClick={onOpenEditor}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Clapperboard size={17} />
          タイムラインを編集する
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="text-center text-xs text-gray-400 hover:text-gray-200"
        >
          最初からやり直す
        </button>
      </div>
    </section>
  );
}
