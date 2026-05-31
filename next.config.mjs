/**
 * GitHub Pages 向け静的エクスポート設定。
 *
 * - `output: 'export'`   → `out/` に純粋な静的HTML/JS/CSSを書き出す（サーバー不要）。
 * - `basePath`           → プロジェクトページ（https://<user>.github.io/<repo>/）配下に
 *                          配信するためのサブパス。GitHub Actions が repo 名を渡す。
 * - `images.unoptimized` → next/image の最適化サーバーが無い静的環境では必須。
 * - `trailingSlash`      → `/editor` を `/editor/index.html` として解決させ、
 *                          GitHub Pages の素朴なルーティングでも 404 にならないようにする。
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
