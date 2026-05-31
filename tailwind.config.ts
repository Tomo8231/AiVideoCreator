import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ダークなクリエイティブツール調のパレット
        ink: {
          950: "#0a0a0f",
          900: "#12121a",
          800: "#1b1b27",
          700: "#272736",
          600: "#3a3a4f",
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
