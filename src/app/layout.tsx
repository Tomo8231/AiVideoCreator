import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthInit } from "@/components/AuthInit";

export const metadata: Metadata = {
  title: "AIVideoCreator",
  description:
    "台本を送るだけで、AIが動画と音声を生成し1本に結合。スマホで微調整できるモバイルファースト動画制作ツール。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0f",
};

/**
 * ハイドレーション前にテーマを適用してちらつきを防ぐ。
 * localStorage の値を data-theme と color-scheme に反映する（既定はダーク）。
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('aivideocreator-theme')||'dark';var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AuthInit />
        {children}
      </body>
    </html>
  );
}
