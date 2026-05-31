"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Music2, Volume2 } from "lucide-react";
import { Project, Scene } from "@/lib/types";
import { formatMsShort } from "@/lib/format";

/**
 * 9:16 縦型のプレビュープレイヤー（要件 3.3 タイムラインプレビュー）。
 *
 * 実装では結合済み mp4 をストリーミング再生するが、ここでは各シーンの
 * previewColor + 字幕を時間に沿って切り替える擬似プレイヤーで再現する。
 * トランジション（ディゾルブ）とダッキングのインジケータも表現する。
 */
export function VideoPreview({
  project,
  currentMs,
  onSeek,
}: {
  project: Project;
  currentMs: number;
  onSeek: (ms: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const total = useMemo(
    () => project.scenes.reduce((sum, s) => sum + s.durationMs, 0),
    [project.scenes]
  );

  // 経過時刻 currentMs からアクティブシーンと、トランジション中かどうかを求める。
  const { activeScene, transitionAlpha } = useMemo(
    () => resolveActive(project.scenes, currentMs),
    [project.scenes, currentMs]
  );

  // 再生ループ（requestAnimationFrame で currentMs を進める）。
  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = ts - lastTsRef.current;
        const next = currentMs + dt;
        if (next >= total) {
          onSeek(total);
          setPlaying(false);
          return;
        }
        onSeek(next);
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, currentMs, total, onSeek]);

  function togglePlay() {
    if (currentMs >= total) onSeek(0);
    setPlaying((p) => !p);
  }

  const narrating = activeScene?.audioStatus === "ready";

  return (
    <div className="flex flex-col items-center">
      {/* 9:16 フレーム */}
      <div className="relative aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-2xl border border-ink-700 bg-black lg:max-w-[300px]">
        {activeScene ? (
          <div
            className="absolute inset-0 transition-[background] duration-300"
            style={{ background: activeScene.previewColor }}
          >
            {/* ディゾルブ中は次シーン色をフェードで重ねる演出 */}
            {transitionAlpha > 0 && (
              <div
                className="absolute inset-0"
                style={{
                  background: "rgba(255,255,255,0.35)",
                  opacity: transitionAlpha,
                }}
              />
            )}
            {/* シーン番号 */}
            <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90">
              SCENE {activeScene.order + 1}
            </span>
            {/* 字幕オーバーレイ（要件 3.3） */}
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="rounded-md bg-black/55 px-2.5 py-1.5 text-center text-[13px] font-medium leading-snug text-white drop-shadow">
                {activeScene.subtitle}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">
            シーンがありません
          </div>
        )}

        {/* 音声インジケータ（ナレーション中 + ダッキング） */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {narrating && (
            <span className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90">
              <Volume2 size={11} /> ナレーション
            </span>
          )}
          {project.bgmEnabled && (
            <span className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90">
              <Music2 size={11} /> BGM
              {narrating && (
                <span className="text-amber-300">
                  ↓{Math.round(project.duckingAmount * 100)}%
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* 再生コントロール + シークバー */}
      <div className="mt-3 flex w-full max-w-[260px] flex-col gap-2 lg:max-w-[300px]">
        <input
          type="range"
          min={0}
          max={total}
          value={Math.min(currentMs, total)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-gray-400">
            {formatMsShort(currentMs)} / {formatMsShort(total)}
          </span>
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-soft"
            aria-label={playing ? "一時停止" : "再生"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <span className="w-12" />
        </div>
      </div>
    </div>
  );
}

/** currentMs からアクティブなシーンと、ディゾルブ進行度を求める。 */
function resolveActive(
  scenes: Scene[],
  currentMs: number
): { activeScene: Scene | null; transitionAlpha: number } {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const start = acc;
    const end = acc + s.durationMs;
    if (currentMs < end || i === scenes.length - 1) {
      // シーン終端 400ms かつ次シーンが dissolve ならトランジション表現。
      const next = scenes[i + 1];
      const remaining = end - currentMs;
      const alpha =
        next && next.transition === "dissolve" && remaining < 400
          ? 1 - remaining / 400
          : 0;
      return { activeScene: s, transitionAlpha: Math.max(0, Math.min(1, alpha)) };
    }
    acc = end;
  }
  return { activeScene: scenes[0] ?? null, transitionAlpha: 0 };
}
