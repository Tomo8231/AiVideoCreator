# AIVideoCreator

台本（スクリプト）からシーンを自動分割し、AIで動画・音声を生成、Remotion で1本に結合して
スマホ上で微調整できる **モバイルファースト動画制作ツール**。
（要件定義書: [doc/要件定義書.md](doc/要件定義書.md)）

## アーキテクチャ（Phase 2: バックエンド）

要件定義書どおり **Next.js (App Router) のサーバー機能**を使う構成に移行しました。
動画・音声の生成と Remotion 結合は **API Routes（サーバー実行）** が担います。
デプロイ先は Vercel など Node ランタイムを持つ環境を想定します（GitHub Pages 等の
静的ホスティングは API Routes を実行できないため非対応）。

```
ブラウザ(React/Zustand)
  └─ src/lib/aiService.ts        ← 経路の単一窓口（server / mock を切替）
       └─ /api/scenes/split      ← 台本のシーン分割（要件 3.1）
       └─ /api/generate/audio    ← ElevenLabs 音声合成（要件 3.1）
       └─ /api/generate/video    ← RunWay 等 動画生成（要件 3.1）
       └─ /api/render            ← Remotion で mp4 結合（要件 3.2）
            └─ src/remotion/*     ← タイムラインを TypeScript で記述
```

### キー無しでも動く（モックフォールバック）

各 API Route は対応する API キーが未設定なら自動でモック応答を返します。
つまり **キーを 1 つも設定しなくてもアプリは完全に動作**し、ローカル開発や CI で
フロー全体を検証できます。実 API を使うときだけ `.env` にキーを入れます
（[.env.example](.env.example) 参照）。

| 環境変数 | 無いとき | あるとき |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | モック音声（尺のみ推定） | ElevenLabs で実合成 |
| `RUNWAY_API_KEY` | モック動画クリップ | RunWay 投入（ポーリングは TODO） |
| `ANTHROPIC_API_KEY` | ヒューリスティック分割 | Claude で意味的に分割 |
| `NEXT_PUBLIC_API_MODE` | `server`（/api を呼ぶ） | `mock` でサーバー無し動作 |

## ローカル開発

Windows なら `quickstart.bat` をダブルクリックで、依存インストール・`.env` 作成・
サーバー起動まで一括実行できます（詳細は [doc/QUICKSTART.md](doc/QUICKSTART.md)）。

```bat
quickstart.bat            :: セットアップ + 開発サーバー
quickstart.bat dev 3100   :: ポート3100で起動
quickstart.bat prod       :: 本番ビルドして起動
quickstart.bat check      :: セットアップのみ（起動しない）
```

手動で行う場合:

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # lint + 型チェック + バンドル
npm start        # 本番サーバー
```

## Supabase（認証 / DB / Storage・RLS, 要件 4）

未設定でもアプリは端末内（localStorage / data URL）で動作します。設定すると
ログイン・プロジェクトのクラウド保存・起点画像の Storage 保存が有効になります。

1. Supabase でプロジェクトを作成。
2. SQL Editor で [supabase/schema.sql](supabase/schema.sql) を実行
   （`projects` テーブル・RLS・`media` バケットとポリシーを作成）。
3. Project Settings → API の URL と anon キーを `.env` に設定:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. アプリの「設定 → アカウント」からログイン。`/projects` で保存・読み込み・削除。

RLS により各ユーザーは自分の行（`projects`）と自分のフォルダ（`media/{userId}/…`）
のみアクセスできます。メディアは非公開バケットに保存し、署名付きURLで一時取得します。

## デプロイ（Vercel 想定）

1. Vercel に本リポジトリを import する。
2. Project Settings → Environment Variables に必要なキーを設定（任意）。
3. push すると自動ビルド・デプロイされる。

> Remotion の実レンダリング（`/api/render`）は Chromium ヘッドレスを必要とします。
> 実行環境に無い場合は自動的に「結合プランの要約」を返す挙動にフォールバックし、
> アプリ自体は止まりません（`RenderResponse.rendered=false`）。

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) が push / PR でビルド（lint・型チェック・
バンドル）を実行します。キー不要でモックフォールバックにより通ります。

## 実装済みの機能（要件マッピング）

| 要件 | 実装 |
| --- | --- |
| 3.1 台本の自動シーン分割 | `/api/scenes/split`（Claude or ヒューリスティック） |
| 3.1 マルチモーダル並列生成 + 進捗 | `/api/generate/{audio,video}` + 進捗UI |
| 3.1 RunWay 動画ジョブのポーリング | `src/server/ai/runway.ts`（作成→`tasks/{id}`をポーリング→URL取得） |
| 3.2 シームレス連結（ディゾルブ） | `src/remotion/VideoComposition.tsx` |
| 3.2 BGM ダッキング | 結合 props に反映（音声設定パネル） |
| 3.3 9:16 タイムラインプレビュー | `VideoPreview`（擬似再生・字幕オーバーレイ） |
| 3.3 ドラッグ&ドロップ並び替え | `Timeline`（@dnd-kit, タッチ対応） |
| 3.3 ミリ秒単位トリミング | `SceneInspector` の尺スライダー |
| 3.3 字幕の直接修正 | `SceneInspector` の字幕テキストエリア |
| 3.3 部分再生成（リテイク） | シーン単位のプロンプト書き換え + 作り直し |
| 4 認証 / DB / Storage・RLS | Supabase（`/login`・`/projects`・起点画像の Storage 保存） |

## 技術スタック

- Next.js 15 (App Router, server) / React 19 / TypeScript
- Remotion 4（動画結合をコードで記述・レンダリング）
- Supabase（Auth / Postgres / Storage・RLS）
- Tailwind CSS / lucide-react / Zustand / @dnd-kit

## 今後（未実装）

- 生成メディア（ナレーション音声 / 動画クリップ）の Storage 保存
  （現状 Storage 連携は起点画像のみ。音声は data URL、動画は RunWay の URL のまま）
- プロジェクトのクラウド自動同期（現状は `/projects` での明示保存・読み込み）
- バックグラウンド Queue と Push 通知（要件 3.1）
- Capacitor によるネイティブ化（要件 2）

> RunWay の動画ジョブのポーリングは実装済み（`src/server/ai/runway.ts`）。
> 動画モデルは image_to_video のため起点画像が必要で、エディタの「起点画像」から
> シーンごとに添付できる（data URL）。全シーン共通の既定画像は `RUNWAY_DEFAULT_IMAGE`。
