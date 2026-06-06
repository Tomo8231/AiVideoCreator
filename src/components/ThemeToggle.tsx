"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/lib/themeStore";

/** ダーク/ライトを切り替えるアイコンボタン。 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const sync = useThemeStore((s) => s.sync);

  // マウント後に DOM の現在テーマへ同期（インラインスクリプトが設定済み）。
  useEffect(() => sync(), [sync]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
      className={`p-2 text-gray-400 transition hover:text-gray-200 ${className}`}
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
