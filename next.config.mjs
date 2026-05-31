/**
 * サーバーモード設定（Phase 2）。
 *
 * Phase 1 は GitHub Pages 向けの静的エクスポート（output: 'export'）だったが、
 * AI 生成・Remotion 結合を担う API Routes（サーバー実行）を導入したため、
 * 静的エクスポートを外してサーバーモードに移行した。
 * デプロイ先は Vercel など Node ランタイムを持つ環境を想定する。
 *
 * Remotion の @remotion/renderer / @remotion/bundler は Node 専用かつ重量級なので、
 * サーバーバンドルに巻き込まれないよう serverExternalPackages で外部化する。
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
  ],
};

export default nextConfig;
