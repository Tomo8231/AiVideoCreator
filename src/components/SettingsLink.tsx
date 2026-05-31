"use client";

import Link from "next/link";
import { Settings } from "lucide-react";

/**
 * どの画面のヘッダーからでも設定画面へ飛べる共通ボタン。
 * モバイル・PC どちらでもヘッダー右端に置く想定。
 */
export function SettingsLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/settings"
      aria-label="API設定"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:border-ink-600 hover:text-white ${className}`}
    >
      <Settings size={15} />
      <span className="hidden sm:inline">設定</span>
    </Link>
  );
}
