/**
 * RunWay (RunwayML Developer API) の低レベルクライアント。サーバー専用。
 *
 * 動画生成は非同期: タスクを作成 → `tasks/{id}` を完了までポーリング → 出力URLを得る。
 * ここでは作成・取得・ポーリング（バックオフ/タイムアウト/中断対応）を実装する。
 *
 * 参考エンドポイント（Developer API）:
 *   POST {BASE}/image_to_video  → { id }
 *   GET  {BASE}/tasks/{id}      → { status, output, ... }
 * BASE / バージョンは env で差し替え可能（テストやモック向け）。
 */

import "server-only";

const BASE = process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com/v1";
const VERSION = process.env.RUNWAY_API_VERSION || "2024-11-06";

export type RunwayStatus =
  | "PENDING"
  | "THROTTLED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface RunwayTask {
  id: string;
  status: RunwayStatus;
  /** 完了時の成果物URL（通常1要素）。 */
  output?: string[];
  /** 失敗時の説明・コード。 */
  failure?: string;
  failureCode?: string;
  /** 0〜1 の進捗。 */
  progress?: number;
}

/** RunWay 呼び出し由来のエラー（HTTPステータス・失敗コードを保持）。 */
export class RunwayError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "RunwayError";
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Runway-Version": VERSION,
    "Content-Type": "application/json",
  };
}

export interface CreateClipParams {
  apiKey: string;
  promptText: string;
  /** image_to_video は起点画像が必須（URL もしくは data URI）。 */
  promptImage: string;
  model?: string;
  durationSec?: number;
  ratio?: string;
  signal?: AbortSignal;
}

/** image_to_video タスクを作成し、タスクIDを返す。 */
export async function createImageToVideoTask(
  p: CreateClipParams
): Promise<string> {
  const res = await fetch(`${BASE}/image_to_video`, {
    method: "POST",
    headers: authHeaders(p.apiKey),
    body: JSON.stringify({
      model: p.model || "gen3a_turbo",
      promptImage: p.promptImage,
      promptText: p.promptText,
      duration: p.durationSec ?? 5,
      ratio: p.ratio || "768:1280",
    }),
    signal: p.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RunwayError(
      `タスク作成に失敗 (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new RunwayError("タスク作成レスポンスに id がありません");
  }
  return data.id;
}

/** タスクの現在状態を取得する。 */
export async function getTask(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<RunwayTask> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: authHeaders(apiKey),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RunwayError(
      `タスク取得に失敗 (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }

  return (await res.json()) as RunwayTask;
}

export interface PollOptions {
  apiKey: string;
  /** ポーリング間隔（ミリ秒）。既定 5000。 */
  intervalMs?: number;
  /** 全体のタイムアウト（ミリ秒）。既定 5分。 */
  timeoutMs?: number;
  /** 進捗のたびに呼ばれる（任意）。 */
  onProgress?: (task: RunwayTask) => void;
  signal?: AbortSignal;
}

/**
 * SUCCEEDED になるまで `tasks/{id}` をポーリングする。
 * FAILED/CANCELLED は RunwayError を投げ、タイムアウトでも投げる。
 */
export async function pollTask(
  taskId: string,
  opts: PollOptions
): Promise<RunwayTask> {
  const interval = Math.max(500, opts.intervalMs ?? 5000);
  const timeout = opts.timeoutMs ?? 5 * 60_000;
  const deadline = Date.now() + timeout;

  for (;;) {
    const task = await getTask(taskId, opts.apiKey, opts.signal);
    opts.onProgress?.(task);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      throw new RunwayError(
        task.failure || `タスクが ${task.status} になりました`,
        undefined,
        task.failureCode
      );
    }

    // PENDING / THROTTLED / RUNNING は継続。次のポーリングが期限を超えるなら打ち切り。
    if (Date.now() + interval >= deadline) {
      throw new RunwayError(
        `ポーリングがタイムアウトしました（${timeout}ms, 最終状態 ${task.status}）`
      );
    }
    await sleep(interval, opts.signal);
  }
}

/** 中断可能な sleep。 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RunwayError("中断されました"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunwayError("中断されました"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
