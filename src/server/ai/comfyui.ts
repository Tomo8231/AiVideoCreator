/**
 * ローカル ComfyUI を使った動画生成クライアント。サーバー専用。
 *
 * ComfyUI は HTTP API を持つ:
 *   POST {base}/upload/image   … 入力画像をアップロード（multipart）
 *   POST {base}/prompt         … ワークフロー(API形式)を投入 → { prompt_id }
 *   GET  {base}/history/{id}   … 完了までポーリング（outputs を取得）
 *   GET  {base}/view?...       … 生成物ファイルを取得
 *
 * ワークフローはモデル/ノード構成ごとに異なるため、ユーザーが ComfyUI の
 * 「Save (API Format)」で書き出した JSON を渡す前提とし、本コードは
 * プレースホルダ（%PROMPT% / %IMAGE% / %SEED%）を差し込んで実行する。
 */

import "server-only";

export class ComfyUIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyUIError";
  }
}

/** API 形式ワークフロー（ノードID -> { class_type, inputs }）。 */
type Workflow = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

export interface ComfyRunParams {
  baseUrl: string;
  /** API 形式ワークフローの JSON 文字列。 */
  workflowJson: string;
  prompt: string;
  /** 起点画像（data URL もしくは http(s) URL）。ワークフローが %IMAGE% を使う場合に必要。 */
  image?: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ComfyRunResult {
  /** 生成物を取得できる {base}/view URL。 */
  mediaUrl: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/** ワークフローを実行し、生成物の view URL を返す。 */
export async function runWorkflow(p: ComfyRunParams): Promise<ComfyRunResult> {
  const base = normalizeBase(p.baseUrl);

  let workflow: Workflow;
  try {
    workflow = JSON.parse(p.workflowJson) as Workflow;
  } catch {
    throw new ComfyUIError(
      "ワークフローJSONを解析できません（ComfyUIの『Save (API Format)』で書き出したJSONを貼り付けてください）"
    );
  }

  // 画像が必要な場合はアップロードしてファイル名を得る。
  let imageName: string | undefined;
  if (p.image && containsPlaceholder(workflow, "%IMAGE%")) {
    imageName = await uploadImage(base, p.image, p.signal);
  }

  const injected = injectPlaceholders(workflow, {
    "%PROMPT%": p.prompt,
    ...(imageName ? { "%IMAGE%": imageName } : {}),
    "%SEED%": String(Math.floor(Math.random() * 2 ** 31)),
  });

  const promptId = await submitPrompt(base, injected, p.signal);
  const outputs = await pollHistory(base, promptId, {
    intervalMs: p.intervalMs ?? 2000,
    timeoutMs: p.timeoutMs ?? 10 * 60_000,
    signal: p.signal,
  });

  const file = pickOutputFile(outputs);
  if (!file) {
    throw new ComfyUIError("生成は完了しましたが、出力ファイルが見つかりませんでした");
  }
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });
  return { mediaUrl: `${base}/view?${params.toString()}` };
}

/** 画像（data URL / URL）を ComfyUI にアップロードし、保存ファイル名を返す。 */
async function uploadImage(
  base: string,
  image: string,
  signal?: AbortSignal
): Promise<string> {
  const blob = await toBlob(image);
  const form = new FormData();
  form.append("image", blob, `seed_${Date.now()}.png`);
  form.append("overwrite", "true");

  const res = await fetch(`${base}/upload/image`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) {
    throw new ComfyUIError(`画像アップロードに失敗 (${res.status})`);
  }
  const data = (await res.json()) as { name?: string; subfolder?: string };
  if (!data.name) throw new ComfyUIError("画像アップロードの応答が不正です");
  // subfolder がある場合は ComfyUI のノード側でそのパスを参照する想定（通常は空）。
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

async function toBlob(image: string): Promise<Blob> {
  if (image.startsWith("data:")) {
    const comma = image.indexOf(",");
    const meta = image.slice(5, comma); // e.g. image/png;base64
    const isBase64 = meta.includes("base64");
    const dataPart = image.slice(comma + 1);
    const mime = meta.split(";")[0] || "image/png";
    const bytes = isBase64
      ? Buffer.from(dataPart, "base64")
      : Buffer.from(decodeURIComponent(dataPart), "utf-8");
    return new Blob([bytes], { type: mime });
  }
  // http(s) URL（Supabase 署名付きURL等）はサーバーから取得して再アップロード。
  const res = await fetch(image);
  if (!res.ok) throw new ComfyUIError(`起点画像の取得に失敗 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "image/png";
  return new Blob([buf], { type });
}

async function submitPrompt(
  base: string,
  workflow: Workflow,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ComfyUIError(`ワークフロー投入に失敗 (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    prompt_id?: string;
    node_errors?: Record<string, unknown>;
  };
  if (data.node_errors && Object.keys(data.node_errors).length > 0) {
    throw new ComfyUIError(
      `ワークフローにエラーがあります: ${JSON.stringify(data.node_errors).slice(0, 300)}`
    );
  }
  if (!data.prompt_id) throw new ComfyUIError("prompt_id を取得できませんでした");
  return data.prompt_id;
}

interface OutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

async function pollHistory(
  base: string,
  promptId: string,
  opts: { intervalMs: number; timeoutMs: number; signal?: AbortSignal }
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    const res = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
      signal: opts.signal,
    });
    if (res.ok) {
      const hist = (await res.json()) as Record<
        string,
        { outputs?: Record<string, unknown>; status?: { status_str?: string } }
      >;
      const entry = hist[promptId];
      if (entry) {
        if (entry.status?.status_str === "error") {
          throw new ComfyUIError("ComfyUI のワークフロー実行がエラーになりました");
        }
        if (entry.outputs) return entry.outputs;
      }
    }
    if (Date.now() + opts.intervalMs >= deadline) {
      throw new ComfyUIError(`生成がタイムアウトしました（${opts.timeoutMs}ms）`);
    }
    await sleep(opts.intervalMs, opts.signal);
  }
}

/** outputs から動画/GIF/画像ファイルを1つ取り出す（動画系を優先）。 */
function pickOutputFile(outputs: Record<string, unknown>): OutputFile | null {
  const buckets = ["videos", "gifs", "images"] as const;
  for (const key of buckets) {
    for (const nodeId of Object.keys(outputs)) {
      const node = outputs[nodeId] as Record<string, unknown> | undefined;
      const arr = node?.[key] as OutputFile[] | undefined;
      if (Array.isArray(arr) && arr.length > 0 && arr[0]?.filename) {
        return arr[0];
      }
    }
  }
  return null;
}

/** ワークフロー内の文字列に指定プレースホルダが含まれるか。 */
function containsPlaceholder(workflow: Workflow, token: string): boolean {
  return JSON.stringify(workflow).includes(token);
}

/** ワークフローを深く走査し、文字列値中のプレースホルダを置換した新オブジェクトを返す。 */
function injectPlaceholders(
  workflow: Workflow,
  values: Record<string, string>
): Workflow {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      // "%SEED%" 単独なら数値に変換（seed入力は number 想定）。
      if (v === "%SEED%") return Number(values["%SEED%"]);
      let out = v;
      for (const [token, val] of Object.entries(values)) {
        if (out.includes(token)) out = out.split(token).join(val);
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] = walk(val);
      }
      return o;
    }
    return v;
  };
  return walk(workflow) as Workflow;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ComfyUIError("中断されました"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ComfyUIError("中断されました"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
