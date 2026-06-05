"use client";

import { useRef, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Scissors,
  Loader2,
  ImagePlus,
  X,
} from "lucide-react";
import { Scene, TransitionType } from "@/lib/types";
import { formatMs } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "none", label: "なし（カット）" },
  { value: "dissolve", label: "ディゾルブ" },
  { value: "fade", label: "フェード" },
];

const DURATION_MIN = 1000;
const DURATION_MAX = 15000;

/**
 * 選択中シーンの詳細編集パネル（要件 3.3）。
 * - 字幕（誤字脱字）の直接修正
 * - ミリ秒単位のトリミング（尺調整）
 * - トランジション選択
 * - 部分再生成（リテイク）: 動画プロンプトを書き換えて作り直す
 */
export function SceneInspector({
  scene,
  onUpdate,
  onRetake,
  onRemove,
}: {
  scene: Scene;
  onUpdate: (patch: Partial<Scene>) => void;
  onRetake: (newPrompt: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [retaking, setRetaking] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy =
    scene.videoStatus === "generating" || scene.audioStatus === "generating";

  /** 選択画像を data URL に変換して起点画像に設定する。 */
  function handleFile(file: File | undefined) {
    setImgError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImgError("画像ファイルを選んでください");
      return;
    }
    // data URL でシーンに保持するため、サイズは控えめに制限（~4MB）。
    if (file.size > 4 * 1024 * 1024) {
      setImgError("画像サイズは 4MB 以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUpdate({ seedImage: String(reader.result) });
    reader.onerror = () => setImgError("画像の読み込みに失敗しました");
    reader.readAsDataURL(file);
  }

  async function handleRetake() {
    setRetaking(true);
    try {
      await onRetake(scene.videoPrompt);
    } finally {
      setRetaking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">シーン {scene.order + 1} の編集</h3>
        <div className="flex gap-1">
          <StatusBadge status={scene.videoStatus} label="映像" />
          <StatusBadge status={scene.audioStatus} label="音声" />
        </div>
      </div>

      {/* 字幕修正 */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-400">字幕（ナレーション）</span>
        <textarea
          value={scene.subtitle}
          onChange={(e) => onUpdate({ subtitle: e.target.value })}
          className="min-h-[72px] resize-none rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      {/* トリミング（尺） */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
            <Scissors size={12} /> 尺（トリミング）
          </span>
          <span className="text-xs tabular-nums text-accent-soft">
            {formatMs(scene.durationMs)}
          </span>
        </div>
        <input
          type="range"
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={50}
          value={scene.durationMs}
          onChange={(e) => onUpdate({ durationMs: Number(e.target.value) })}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>{(DURATION_MIN / 1000).toFixed(1)}s</span>
          <span>50ms ステップ</span>
          <span>{(DURATION_MAX / 1000).toFixed(0)}s</span>
        </div>
      </div>

      {/* トランジション */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-400">
          このシーンへのトランジション
        </span>
        <select
          value={scene.transition}
          onChange={(e) =>
            onUpdate({ transition: e.target.value as TransitionType })
          }
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {TRANSITIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {/* 起点画像（RunWay image_to_video 用） */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-400">
          起点画像（動画生成のもとになる画像）
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {scene.seedImage ? (
          <div className="flex items-center gap-3">
            {/* data URL を表示するため next/image ではなく img を使用 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scene.seedImage}
              alt="起点画像"
              className="h-16 w-16 rounded-lg border border-ink-700 object-cover"
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="self-start rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-ink-600"
              >
                差し替え
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ seedImage: undefined })}
                className="inline-flex items-center gap-1 self-start text-xs text-red-400 hover:text-red-300"
              >
                <X size={12} /> 削除
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 px-3 py-3 text-xs text-gray-400 hover:border-accent hover:text-gray-200"
          >
            <ImagePlus size={15} /> 画像を追加（任意）
          </button>
        )}
        {imgError && <span className="text-[11px] text-red-400">{imgError}</span>}
        <span className="text-[11px] leading-relaxed text-gray-500">
          RunWay の動画生成は画像が起点です。未添付でもモック生成は動作します。
        </span>
      </div>

      {/* 部分再生成（リテイク） */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-ink-700 bg-ink-900 p-3">
        <span className="text-xs font-medium text-gray-400">
          動画プロンプト（リテイク用）
        </span>
        <textarea
          value={scene.videoPrompt}
          onChange={(e) => onUpdate({ videoPrompt: e.target.value })}
          className="min-h-[60px] resize-none rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={busy || retaking}
          onClick={handleRetake}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-white transition enabled:hover:bg-accent-soft disabled:opacity-40"
        >
          {retaking || busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          このシーンを作り直す
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center justify-center gap-1.5 self-start text-xs text-red-400 hover:text-red-300"
      >
        <Trash2 size={13} /> シーンを削除
      </button>
    </div>
  );
}
