import type { Config } from "tailwindcss";

/** CSS変数（空白区切りRGB）を参照しつつ、不透明度ユーティリティも効くヘルパー。 */
function v(name: string) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // サーフェス/ボーダー系。値は globals.css の :root[data-theme] で切替える。
        ink: {
          950: v("--ink-950"),
          900: v("--ink-900"),
          800: v("--ink-800"),
          700: v("--ink-700"),
          600: v("--ink-600"),
        },
        // テキストに使うグレー階調のみテーマ対応に差し替え（他の階調は既定のまま）。
        gray: {
          200: v("--gray-200"),
          300: v("--gray-300"),
          400: v("--gray-400"),
          500: v("--gray-500"),
          600: v("--gray-600"),
        },
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d86ff",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
