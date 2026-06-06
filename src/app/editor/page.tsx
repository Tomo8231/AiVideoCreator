"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Film, Loader2, Settings } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { totalDurationMs } from "@/lib/types";
import { formatMsShort } from "@/lib/format";
import { requestRender } from "@/lib/aiService";
import { VideoPreview } from "@/components/VideoPreview";
import { Timeline } from "@/components/Timeline";
import { SceneInspector } from "@/components/SceneInspector";
import { AudioSettings } from "@/components/AudioSettings";

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
  const [rendering, setRendering] = useState(false);

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

  async function handleExport() {
    if (!project || rendering) return;
    setRendering(true);
    try {
      // Remotion 結合を /api/render に依頼（要件 3.2）。
      const result = await requestRender({
        title: project.title,
        bgmEnabled: project.bgmEnabled,
        duckingAmount: project.duckingAmount,
        scenes: project.scenes.map((s) => ({
          id: s.id,
          order: s.order,
          subtitle: s.subtitle,
          durationMs: s.durationMs,
          transition: s.transition,
          previewColor: s.previewColor,
        })),
      });

      if (result?.rendered && result.videoUrl) {
        // 実レンダリング成功 → mp4 を開く。
        window.open(result.videoUrl, "_blank");
        return;
      }

      // レンダリング不可（Chromium未導入等）またはモードmock → 結合プランを提示。
      const plan = result?.plan;
      const summary = [
        result
          ? "サーバーで結合を実行しました（実レンダリングは環境依存）。"
          : "クライアントモードのため結合プランのみ表示します。",
        "",
        `タイトル: ${project.title}`,
        `シーン数: ${plan?.sceneCount ?? project.scenes.length}`,
        `総尺: ${formatMsShort(plan?.totalDurationMs ?? totalDurationMs(project))}`,
        `解像度: ${plan ? `${plan.width}x${plan.height} @${plan.fps}fps` : "1080x1920 @30fps"}`,
        `BGM: ${project.bgmEnabled ? `ON（ダッキング -${Math.round(project.duckingAmount * 100)}%）` : "OFF"}`,
        result?.error ? `\n注: ${result.error}` : "",
      ].join("\n");
      alert(summary);
    } finally {
      setRendering(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-8 pt-4 lg:max-w-6xl">
      {/* ヘッダー */}
      <header className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="truncate px-2 text-sm font-semibold">{project.title}</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="p-1.5 text-gray-400 hover:text-gray-200"
            aria-label="設定"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={rendering}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition enabled:hover:bg-accent-soft disabled:opacity-50"
          >
            {rendering ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {rendering ? "結合中…" : "書き出し"}
          </button>
        </div>
      </header>

      {/* 広い画面では 左:プレビュー / 右:編集 の2カラム。モバイルは縦積み。 */}
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 左: プレビュー（デスクトップでは追従） */}
        <div className="lg:sticky lg:top-4">
          <VideoPreview
            project={project}
            currentMs={currentMs}
            onSeek={setCurrentMs}
          />
        </div>

        {/* 右: 編集エリア */}
        <div className="mt-5 flex flex-col gap-4 lg:mt-0">
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

          {/* 音声設定 */}
          <AudioSettings
            bgmEnabled={project.bgmEnabled}
            duckingAmount={project.duckingAmount}
            onBgmChange={setBgmEnabled}
            onDuckingChange={setDuckingAmount}
          />

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
