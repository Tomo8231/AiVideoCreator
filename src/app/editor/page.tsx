"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Film } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { totalDurationMs } from "@/lib/types";
import { formatMsShort } from "@/lib/format";
import { VideoPreview } from "@/components/VideoPreview";
import { Timeline } from "@/components/Timeline";
import { SceneInspector } from "@/components/SceneInspector";
import { AudioSettings } from "@/components/AudioSettings";
import { SettingsLink } from "@/components/SettingsLink";

export default function EditorPage() {
  const router = useRouter();
  const project = useAppStore((s) => s.project);
  const reorderScenes = useAppStore((s) => s.reorderScenes);
  const updateScene = useAppStore((s) => s.updateScene);
  const removeScene = useAppStore((s) => s.removeScene);
  const retakeScene = useAppStore((s) => s.retakeScene);
  const setBgmEnabled = useAppStore((s) => s.setBgmEnabled);
  const setDuckingAmount = useAppStore((s) => s.setDuckingAmount);

  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);

  // localStorage 永続化の rehydrate はクライアントのみ。SSR との不一致を避ける。
  useEffect(() => setMounted(true), []);

  // 初回に先頭シーンを選択。
  useEffect(() => {
    if (project && !selectedId && project.scenes.length > 0) {
      setSelectedId(project.scenes[0].id);
    }
  }, [project, selectedId]);

  const selectedScene = useMemo(
    () => project?.scenes.find((s) => s.id === selectedId) ?? null,
    [project, selectedId]
  );

  if (!mounted) {
    return <div className="min-h-screen" />;
  }

  if (!project || project.scenes.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Film size={36} className="text-gray-600" />
        <p className="text-sm text-gray-400">
          編集するプロジェクトがありません。台本から動画を生成してください。
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-soft"
        >
          台本入力へ
        </button>
      </main>
    );
  }

  function handleExport() {
    // 静的ホスティングでは実際の mp4 結合（Remotion/サーバー）は行えないため、
    // ここではデモとして結合パラメータのサマリを表示する。
    const summary = [
      `タイトル: ${project!.title}`,
      `シーン数: ${project!.scenes.length}`,
      `総尺: ${formatMsShort(totalDurationMs(project!))}`,
      `BGM: ${project!.bgmEnabled ? `ON（ダッキング -${Math.round(project!.duckingAmount * 100)}%）` : "OFF"}`,
      "",
      "※ 実装版ではこのパラメータを Next.js/Remotion サーバーへ送信し、",
      "  9:16 の mp4 として結合・レンダリングします。",
    ].join("\n");
    alert(summary);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-8 pt-4 sm:px-6">
      {/* ヘッダー */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex shrink-0 items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="truncate px-2 text-sm font-semibold">{project.title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <SettingsLink className="hidden sm:inline-flex" />
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-soft"
          >
            <Download size={14} /> 書き出し
          </button>
        </div>
      </header>

      {/* PC: 左にプレビュー（固定）+ 音声設定、右に編集。モバイル: 縦積み。 */}
      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* プレビュー列 */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:w-[340px] lg:shrink-0">
          <VideoPreview
            project={project}
            currentMs={currentMs}
            onSeek={setCurrentMs}
          />
          <AudioSettings
            bgmEnabled={project.bgmEnabled}
            duckingAmount={project.duckingAmount}
            onBgmChange={setBgmEnabled}
            onDuckingChange={setDuckingAmount}
          />
        </div>

        {/* 編集列 */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* タイムライン */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              タイムライン（ドラッグで並び替え）
            </h2>
            <Timeline
              scenes={project.scenes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={reorderScenes}
            />
          </section>

          {/* 選択シーンの編集 */}
          <section className="rounded-2xl border border-ink-700 bg-ink-800/60 p-4">
            {selectedScene ? (
              <SceneInspector
                scene={selectedScene}
                onUpdate={(patch) => updateScene(selectedScene.id, patch)}
                onRetake={(prompt) => retakeScene(selectedScene.id, prompt)}
                onRemove={() => {
                  removeScene(selectedScene.id);
                  setSelectedId(null);
                }}
              />
            ) : (
              <p className="text-center text-xs text-gray-500">
                タイムラインからシーンを選択して編集します。
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
