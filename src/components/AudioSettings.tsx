"use client";

import { Music2 } from "lucide-react";

/**
 * BGM とダッキング設定（要件 3.2 BGMとナレーションのダッキング）。
 * ナレーション中に BGM をどれだけ下げるかを係数で調整する。
 */
export function AudioSettings({
  bgmEnabled,
  duckingAmount,
  onBgmChange,
  onDuckingChange,
}: {
  bgmEnabled: boolean;
  duckingAmount: number;
  onBgmChange: (enabled: boolean) => void;
  onDuckingChange: (amount: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Music2 size={15} className="text-accent-soft" /> BGM
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={bgmEnabled}
          onClick={() => onBgmChange(!bgmEnabled)}
          className={`relative h-6 w-11 rounded-full transition ${
            bgmEnabled ? "bg-accent" : "bg-ink-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
              bgmEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className={`flex flex-col gap-1.5 ${bgmEnabled ? "" : "opacity-40"}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            ナレーション中の BGM ダッキング
          </span>
          <span className="text-xs tabular-nums text-accent-soft">
            -{Math.round(duckingAmount * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={duckingAmount}
          disabled={!bgmEnabled}
          onChange={(e) => onDuckingChange(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
    </div>
  );
}
