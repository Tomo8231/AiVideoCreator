/**
 * ジョブ実行（サーバー専用・非同期）。
 *
 * POST /api/jobs から createAndRunJob() を呼ぶと、ジョブを登録して即座に id を返し、
 * 実際の生成はバックグラウンドで進める（プロセスが生き続ける PC サーバー前提）。
 * キーやプロバイダ設定はすべてサーバーの環境変数を使う（スマホはキーを送らない）。
 */

import "server-only";
import {
  CreateJobRequest,
  JobDTO,
  JobSceneDTO,
  countDoneScenes,
} from "@/lib/jobs";
import { uid } from "@/lib/sceneSplit";
import { splitScript } from "../ai/scenes";
import { generateClip } from "../ai/video";
import { synthesizeNarration } from "../ai/audio";
import { getJob, patchJob, patchScene, putJob } from "./store";

/** ジョブを登録し、バックグラウンドで実行を開始して即返す。 */
export function createAndRunJob(req: CreateJobRequest): JobDTO {
  const now = Date.now();
  const job: JobDTO = {
    id: uid(),
    title: req.title?.trim() || "無題のプロジェクト",
    state: "queued",
    createdAt: now,
    updatedAt: now,
    scenes: [],
    progress: { done: 0, total: 0 },
  };
  putJob(job);

  // バックグラウンド実行（レスポンスはブロックしない）。
  void runJob(job.id, req).catch((e) => {
    patchJob(job.id, {
      state: "failed",
      error: e instanceof Error ? e.message : "ジョブ実行に失敗しました",
    });
  });

  return job;
}

async function runJob(id: string, req: CreateJobRequest): Promise<void> {
  patchJob(id, { state: "running" });

  // 1) 台本をシーンに分割（要件 3.1）。
  let scenes;
  try {
    const r = await splitScript(req.script);
    scenes = r.scenes;
  } catch (e) {
    patchJob(id, {
      state: "failed",
      error:
        e instanceof Error ? `分割に失敗: ${e.message}` : "台本の分割に失敗しました",
    });
    return;
  }
  if (scenes.length === 0) {
    patchJob(id, { state: "failed", error: "シーンを生成できませんでした" });
    return;
  }

  const sceneDtos: JobSceneDTO[] = scenes.map((s) => ({
    id: s.id,
    order: s.order,
    scriptText: s.scriptText,
    subtitle: s.subtitle,
    videoPrompt: s.videoPrompt,
    videoStatus: "pending",
    audioStatus: "pending",
  }));
  patchJob(id, {
    scenes: sceneDtos,
    progress: { done: 0, total: sceneDtos.length },
  });

  // シーン順の起点画像（images[order] 優先、無ければ defaultImage）。
  const imageFor = (order: number): string | undefined =>
    req.images?.[order] ?? req.defaultImage;

  // 2) シーンごとに生成。GPU 負荷を避けるためシーンは逐次、映像/音声は並列。
  for (const sc of sceneDtos) {
    patchScene(id, sc.id, {
      videoStatus: "generating",
      audioStatus: "generating",
    });

    const seed = imageFor(sc.order);
    const [v, a] = await Promise.all([
      generateClip(sc.videoPrompt, { promptImage: seed }),
      synthesizeNarration(sc.subtitle),
    ]);

    patchScene(id, sc.id, {
      videoStatus: v.ok ? "ready" : "failed",
      videoError: v.ok ? undefined : v.error,
      videoUrl: v.mediaUrl,
      audioStatus: a.ok ? "ready" : "failed",
      audioError: a.ok ? undefined : a.error,
      audioUrl: a.mediaUrl,
    });

    const job = getJob(id);
    if (job) {
      patchJob(id, {
        progress: {
          done: countDoneScenes(job.scenes),
          total: job.scenes.length,
        },
      });
    }
  }

  patchJob(id, { state: "completed" });
}
