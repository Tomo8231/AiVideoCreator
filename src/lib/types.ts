/**
 * AIVideoCreator のドメイン型。
 *
 * 要件定義書 3 章の機能（台本→シーン分割→マルチモーダル生成→結合→編集）を
 * フロントエンドの状態として表現する。サーバー側（Next.js / Remotion / Supabase）が
 * 確定したときに、ここを境界にしてモックを実APIへ差し替える。
 */

/** 各種非同期生成ジョブの状態（要件 3.1 進捗通知 / Queue を UI 上で表す）。 */
export type GenerationStatus =
  | "pending" // 未着手
  | "generating" // 生成中（動画/音声APIを叩いている想定）
  | "ready" // 生成完了
  | "failed"; // 失敗（リテイク対象）

/** トランジション種別（要件 3.2 シームレス連結）。 */
export type TransitionType = "none" | "dissolve" | "fade";

/**
 * 1 シーン = 台本の 1 章。
 * 動画クリップ・ナレーション音声・字幕をひとまとめにした編集単位。
 */
export interface Scene {
  id: string;
  /** 表示順（タイムライン上の並び）。0 始まり。 */
  order: number;
  /** 台本から切り出した元テキスト。 */
  scriptText: string;
  /** このシーンの動画生成に使うプロンプト（リテイク時に書き換える）。 */
  videoPrompt: string;
  /** 字幕（ナレーションに同期。スマホ上で誤字脱字を直接修正できる＝要件 3.3）。 */
  subtitle: string;

  /** シーンの尺（ミリ秒）。トリミングで変わる。 */
  durationMs: number;
  /** トリミング開始位置（ミリ秒, クリップ先頭からのオフセット）。 */
  trimStartMs: number;

  /** 後続シーンへのトランジション。 */
  transition: TransitionType;

  /** 動画生成ジョブの状態。 */
  videoStatus: GenerationStatus;
  /** 音声（ナレーション）生成ジョブの状態。 */
  audioStatus: GenerationStatus;

  /** モック上のプレビュー色（実装では生成動画のサムネ/動画URLに置き換わる）。 */
  previewColor: string;

  /**
   * RunWay image_to_video の起点画像（data URL）。
   * 動画生成モデルは画像必須のため、ユーザーがシーンごとに添付する。
   */
  seedImage?: string;
}

/** プロジェクト全体（1 本の動画）。 */
export interface Project {
  id: string;
  title: string;
  /** 元の台本全文。 */
  script: string;
  scenes: Scene[];
  /** BGM を有効化するか（要件 3.2 ダッキング処理の対象）。 */
  bgmEnabled: boolean;
  /** ナレーション中に BGM を下げる量（dB 相当, 0〜1 の係数）。 */
  duckingAmount: number;
  createdAt: number;
}

/** 各シーンの合計尺を踏まえたプロジェクト総尺（ミリ秒）。 */
export function totalDurationMs(project: Project): number {
  return project.scenes.reduce((sum, s) => sum + s.durationMs, 0);
}
