"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Sparkles,
  FileText,
  Loader2,
  Wand2,
  Music2,
  SlidersHorizontal,
  KeyRound,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { SAMPLE_SCRIPT } from "@/lib/sampleScript";
import { StatusBadge } from "@/components/StatusBadge";
import { SettingsLink } from "@/components/SettingsLink";
import { useSettingsStore, countConfiguredRequired } from "@/lib/apiSettings";

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

  const sceneCount = project?.scenes.length ?? 0;

  async function handleGenerate() {
    if (!script.trim()) return;
    createProjectFromScript(title, script);
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-6 lg:px-8">
      {/* トップバー：ロゴ + 設定（全幅・全デバイス共通） */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent-soft">
            <Clapperboard size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">AIVideoCreator</h1>
            <p className="text-xs text-gray-400">台本から、AIが動画を生成・結合</p>
          </div>
        </div>
        <SettingsLink />
      </div>

      {/* 2 カラム：PC では左に紹介、右に操作カード。モバイルでは操作のみ。 */}
      <div className="flex flex-1 flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
        <Intro />

        <div className="w-full lg:w-[440px] lg:shrink-0">
          <div className="rounded-2xl border-ink-700 lg:border lg:bg-ink-900/40 lg:p-6">
            <ApiKeyStatus />
            {phase === "input" && (
              <InputPhase
                title={title}
                script={script}
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
          </div>
        </div>
      </div>
    </main>
  );
}

/** PC 向けの紹介カラム（モバイルでは非表示にして操作に集中させる）。 */
function Intro() {
  const features = [
    {
      icon: Wand2,
      title: "台本をAIが自動でシーン分割",
      desc: "長文の台本を貼り付けるだけで、章ごとのシーンに自動で切り分けます。",
    },
    {
      icon: SlidersHorizontal,
      title: "タイムラインをミリ秒単位で編集",
      desc: "ドラッグで並び替え、トリミング、字幕修正、部分再生成まで。",
    },
    {
      icon: Music2,
      title: "BGMとナレーションを自動ダッキング",
      desc: "ナレーション中はBGMを自動で下げ、聴きやすい1本に結合します。",
    },
  ];

  return (
    <div className="hidden flex-1 lg:block">
      <h2 className="text-3xl font-bold leading-tight">
        台本を送るだけで、
        <br />
        <span className="text-accent-soft">AIが動画を1本に</span>。
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-400">
        スマホでもPCでも。テキストの台本からAIが映像とナレーションを生成し、
        トランジションを挟んでシームレスに結合します。
      </p>
      <ul className="mt-8 flex flex-col gap-5">
        {features.map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
              <f.icon size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                {f.desc}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** APIキーの設定状況をカード上部に表示し、未設定なら設定画面へ誘導する。 */
function ApiKeyStatus() {
  const keys = useSettingsStore((s) => s.apiKeys);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // SSR/初回ハイドレーション時は何も出さない（localStorage 未読込のため）。
  if (!mounted) return null;

  const { configured, total } = countConfiguredRequired(keys);
  const allSet = configured >= total;

  return (
    <Link
      href="/settings"
      className={`mb-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs transition ${
        allSet
          ? "border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-500/50"
          : "border-amber-500/30 bg-amber-500/10 hover:border-amber-500/50"
      }`}
    >
      {allSet ? (
        <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
      ) : (
        <AlertCircle size={16} className="shrink-0 text-amber-400" />
      )}
      <span className="flex-1 leading-snug text-gray-300">
        {allSet
          ? "APIキー設定済み。生成の準備ができています。"
          : `APIキーが未設定です（${configured}/${total}）。デモはこのまま試せます。`}
      </span>
      <span className="inline-flex items-center gap-1 font-medium text-accent-soft">
        <KeyRound size={13} /> 設定
      </span>
    </Link>
  );
}

function InputPhase({
  title,
  script,
  onTitle,
  onScript,
  onUseSample,
  onGenerate,
}: {
  title: string;
  script: string;
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
          className="min-h-[220px] flex-1 resize-none rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-accent thin-scroll lg:min-h-[200px]"
        />
        <span className="self-end text-[11px] text-gray-500">{charCount} 文字</span>
      </label>

      <button
        type="button"
        disabled={!script.trim()}
        onClick={onGenerate}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles size={17} />
        解析して動画を生成
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

      <div className="mt-2 flex flex-col gap-2">
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
