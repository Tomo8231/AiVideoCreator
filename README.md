# AIVideoCreator

台本（スクリプト）からシーンを自動分割し、AIで動画・音声を生成、1本に結合してスマホ上で
微調整できる **モバイルファースト動画制作ツール** のフロントエンド実装です。
（要件定義書: [doc/要件定義書.md](doc/要件定義書.md)）

## このリポジトリのスコープ

GitHub Pages は**静的ホスティング専用**で、要件定義書が想定するサーバーサイド処理
（Next.js API Routes / Remotion レンダリング / Push 通知 Queue）は実行できません。
そのため本リポジトリは次の方針で実装しています。

- **Next.js (App Router) + `output: 'export'`** による静的サイトとして構築
- **AI バックエンドはモック**（`src/lib/mockApi.ts`）。実 API（RunWay / HeyGen /
  ElevenLabs / Remotion）導入時はこのファイルを境界に差し替え可能
- UI・操作フロー（台本分割 → 並列生成 → タイムライン編集）は要件 3 章に準拠

### 実装済みの機能（UI / フロー）

| 要件 | 実装 |
| --- | --- |
| 3.1 台本の自動シーン分割 | `splitScriptIntoScenes()`（段落/句点ヒューリスティクス） |
| 3.1 マルチモーダル並列生成 + 進捗 | ホーム画面の生成プログレス（シーン別 映像/音声 ステータス） |
| 3.2 シームレス連結（ディゾルブ） | プレビューのトランジション表現 + シーン別トランジション設定 |
| 3.2 BGM ダッキング | 音声設定パネル（BGM ON/OFF・ダッキング量） |
| 3.3 9:16 タイムラインプレビュー | `VideoPreview`（擬似再生・字幕オーバーレイ） |
| 3.3 ドラッグ&ドロップ並び替え | `Timeline`（@dnd-kit, タッチ対応） |
| 3.3 ミリ秒単位トリミング | `SceneInspector` の尺スライダー（50ms ステップ） |
| 3.3 字幕の直接修正 | `SceneInspector` の字幕テキストエリア |
| 3.3 部分再生成（リテイク） | シーン単位のプロンプト書き換え + 作り直し |
| 2 章 外部 AI API キー | 設定画面（`/settings`）で台本解析(LLM)/RunWay/ElevenLabs/HeyGen のキーを入力・端末保存 |

### レスポンシブ UI（スマホ / PC 両対応）

モバイルファーストを保ちつつ、PC（`lg` ブレークポイント以上）でも快適に使えるよう
レイアウトを最適化しています。

- ホーム: PC では左に機能紹介、右に台本入力カードの 2 カラム表示
- エディタ: PC ではプレビュー＋音声設定を左サイドに固定し、右でタイムライン/シーン編集
- いずれの画面もスマホでは従来どおり 1 カラムの縦積み

### API キー設定

`/settings` で外部 AI の API キーを入力できます（ヘッダーの「設定」ボタンから遷移）。

- 対象: 台本解析(LLM) / 動画生成(RunWay) / 音声合成(ElevenLabs) / アバター(HeyGen, 任意)
- キーは**外部送信されず、この端末の localStorage にのみ保存**されます
- 実 API 導入時は `src/lib/apiSettings.ts` の保存値を `mockApi.ts` の差し替え先へ渡します

## ローカル開発

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 静的エクスポート → out/
```

## GitHub Pages へのデプロイ

1. リポジトリの **Settings → Pages → Build and deployment → Source** を
   **「GitHub Actions」** に設定する。
2. `main` ブランチに push すると [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
   が走り、`out/` を Pages へデプロイする。
3. 公開 URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

ワークフローはリポジトリ名を `NEXT_PUBLIC_BASE_PATH` に自動で渡すため、プロジェクト
ページのサブパス配信でもアセットのパスが崩れません（`next.config.mjs` 参照）。

> ユーザー/Organization のルートページ（`<user>.github.io`）として公開する場合は
> basePath が不要です。ワークフローの `NEXT_PUBLIC_BASE_PATH` を空文字にしてください。

## 技術スタック

- Next.js 15 (App Router, static export) / React 19 / TypeScript
- Tailwind CSS / lucide-react
- Zustand（状態管理 + localStorage 永続化）
- @dnd-kit（タイムラインの並び替え）
