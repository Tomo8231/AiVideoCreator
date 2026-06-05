# クイックスタート（Windows）

`quickstart.bat` を使うと、依存インストール・`.env` 作成・サーバー起動までを一括で
行えます。**Node.js 20 以上**だけ事前に入れておいてください（https://nodejs.org/）。

## 一番かんたんな始め方

エクスプローラーで `quickstart.bat` をダブルクリック。
初回は自動で次を行い、開発サーバーが起動します。

1. Node.js の有無を確認
2. `.env` が無ければ `.env.example` からコピー
3. `node_modules` が無ければ `npm install`
4. 開発サーバーを起動（既定 http://localhost:3000 ）

ブラウザで http://localhost:3000 を開けば使えます。停止は端末で `Ctrl + C`。

## コマンドラインからの使い方

```bat
quickstart.bat              :: セットアップ + 開発サーバー（既定）
quickstart.bat dev          :: 開発サーバー（ホットリロード）
quickstart.bat dev 3100     :: ポート3100で開発サーバー
quickstart.bat prod         :: 本番ビルドして起動（npm run build → start）
quickstart.bat prod 8080    :: ポート8080で本番起動
quickstart.bat check        :: セットアップのみ（サーバーは起動しない／動作確認用）
```

| モード | 用途 | 内部コマンド |
| --- | --- | --- |
| `dev`（既定） | 開発。コード変更が即反映 | `npm run dev` |
| `prod` | 本番に近い形で確認 | `npm run build` → `npm run start` |
| `check` | CI や初回診断（起動しない） | セットアップのみ |

## ポートについて

既定は **3000** です。すでに別アプリが 3000 を使っている場合は第2引数でポートを
指定してください（例: `quickstart.bat dev 3100`）。バッチは `PORT` 環境変数を設定し、
Next.js がそれを使って起動します。

## API キー / 各種設定

- すべてのキーは**未設定でも動作**します（生成はモック、保存はこの端末内）。
- 実 API を使うときは 2 通り:
  1. アプリの **設定画面（右上の歯車）** からブラウザに保存（手軽。共有端末は非推奨）。
  2. `.env` に記入してサーバー側で使用（安全。Vercel 等の環境変数も同様）。
- 設定できるキーの一覧と説明は [.env.example](../.env.example) を参照。
  - `ELEVENLABS_API_KEY` … ナレーション音声合成
  - `RUNWAY_API_KEY`（+ `RUNWAY_DEFAULT_IMAGE`）… 動画生成（image_to_video）
  - `ANTHROPIC_API_KEY` … 台本のシーン分割を Claude で実施
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` … 認証・クラウド保存

## Supabase（任意）

ログインやプロジェクトのクラウド保存を使う場合のみ必要です。
手順は [README](../README.md) の Supabase 節と
[supabase/schema.sql](../supabase/schema.sql) を参照してください。

## トラブルシューティング

- **`Node.js not found`** … Node 20+ を入れてターミナルを開き直す。
- **ポートが使用中（EADDRINUSE）** … 別ポートを指定（`quickstart.bat dev 3100`）。
- **`npm install` が失敗** … ネットワークやプロキシを確認し、`node_modules` を消して再実行。
- **Remotion 書き出しが `rendered:false`** … 実レンダリングには Chromium が必要。
  無い環境では結合プランのみ返す仕様（アプリは継続動作）。
- **文字化け** … バッチのログは英語です。日本語の説明はこのドキュメントを参照。

## 補足: macOS / Linux

バッチは Windows 用です。他 OS では直接コマンドで:

```bash
npm install
cp .env.example .env   # 任意
npm run dev            # http://localhost:3000
```
