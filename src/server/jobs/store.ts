/**
 * ジョブの永続ストア（サーバー専用）。
 *
 * 長時間動く PC サーバー（next start）のプロセス内メモリを正とし、
 * data/jobs.json にスナップショットして再起動をまたいで一覧を保持する。
 * 画像の data URL は肥大化するためスナップショットには保存しない。
 */

import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JobDTO, JobSceneDTO, JobSummary } from "@/lib/jobs";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "jobs.json");
const MAX_JOBS = 100;

const jobs = new Map<string, JobDTO>();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(FILE)) {
      const arr = JSON.parse(readFileSync(FILE, "utf-8")) as JobDTO[];
      for (const j of arr) jobs.set(j.id, j);
    }
  } catch {
    // 壊れていても起動は続行（空から始める）。
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 400);
}

function persistNow() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    // 新しい順に MAX_JOBS 件、data URL 画像は落としてスナップショット。
    const arr = [...jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_JOBS);
    writeFileSync(FILE, JSON.stringify(arr));
  } catch {
    // 保存失敗は致命ではない（メモリ上では継続）。
  }
}

export function putJob(job: JobDTO) {
  ensureLoaded();
  jobs.set(job.id, job);
  scheduleSave();
}

export function getJob(id: string): JobDTO | undefined {
  ensureLoaded();
  return jobs.get(id);
}

export function listJobs(): JobSummary[] {
  ensureLoaded();
  return [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      title: j.title,
      state: j.state,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      progress: j.progress,
    }));
}

export function deleteJob(id: string): boolean {
  ensureLoaded();
  const ok = jobs.delete(id);
  if (ok) scheduleSave();
  return ok;
}

/** ジョブ全体の部分更新（updatedAt を自動更新）。 */
export function patchJob(id: string, patch: Partial<JobDTO>) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
  scheduleSave();
}

/** 特定シーンの部分更新。進捗カウントも再計算する。 */
export function patchScene(
  id: string,
  sceneId: string,
  patch: Partial<JobSceneDTO>
) {
  const job = jobs.get(id);
  if (!job) return;
  const scene = job.scenes.find((s) => s.id === sceneId);
  if (!scene) return;
  Object.assign(scene, patch);
  job.updatedAt = Date.now();
  scheduleSave();
}
