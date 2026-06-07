import { NextResponse } from "next/server";
import { CreateJobRequest } from "@/lib/jobs";
import { createAndRunJob } from "@/server/jobs/runner";
import { listJobs } from "@/server/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/jobs — 台本＋画像を受け取り、ジョブを作成して非同期生成を開始（要件 3.1）。 */
export async function POST(req: Request) {
  let body: CreateJobRequest;
  try {
    body = (await req.json()) as CreateJobRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const job = createAndRunJob(body);
  return NextResponse.json({ id: job.id }, { status: 202 });
}

/** GET /api/jobs — ジョブ一覧（新しい順）。 */
export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
