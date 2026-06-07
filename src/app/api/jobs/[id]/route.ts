import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/server/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/jobs/{id} — ジョブの現在状態（スマホがポーリングする）。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

/** DELETE /api/jobs/{id} — ジョブを削除。 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = deleteJob(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
