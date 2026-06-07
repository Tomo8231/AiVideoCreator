/**
 * ジョブAPIのクライアント（スマホ/ブラウザから呼ぶ）。
 * アプリと同一オリジン（PCサーバー）に対して fetch する。
 */

import {
  CreateJobRequest,
  CreateJobResponse,
  JobDTO,
  JobSummary,
} from "./jobs";

export async function createJob(
  req: CreateJobRequest
): Promise<CreateJobResponse> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error || `投入に失敗 (${res.status})`);
  }
  return (await res.json()) as CreateJobResponse;
}

export async function fetchJob(id: string): Promise<JobDTO> {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`取得に失敗 (${res.status})`);
  return (await res.json()) as JobDTO;
}

export async function fetchJobs(): Promise<JobSummary[]> {
  const res = await fetch("/api/jobs", { cache: "no-store" });
  if (!res.ok) throw new Error(`一覧の取得に失敗 (${res.status})`);
  const data = (await res.json()) as { jobs: JobSummary[] };
  return data.jobs;
}

export async function deleteJob(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}`, { method: "DELETE" });
}
