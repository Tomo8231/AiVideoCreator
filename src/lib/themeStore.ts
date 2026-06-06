/**
 * テーマ（ダーク/ライト）の状態。
 *
 * 実際の適用（data-theme 属性・localStorage 反映）は applyTheme で行う。
 * 初期値のちらつき防止は layout 内のインラインスクリプトが担当し、
 * このストアはマウント後に DOM の現在値へ同期する。
 */

import { create } from "zustand";

export type Theme = "dark" | "light";
const STORAGE_KEY = "aivideocreator-theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage 不可環境では無視 */
  }
}

interface ThemeState {
  theme: Theme;
  /** マウント時に DOM（インラインスクリプトが設定済み）から現在テーマを取り込む。 */
  sync: () => void;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  sync: () => {
    if (typeof document === "undefined") return;
    const t = (document.documentElement.dataset.theme as Theme) || "dark";
    set({ theme: t });
  },
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
  },
}));
