"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import { JobDTO } from "@/lib/jobs";
import { fetchJob } from "@/lib/jobsClient";
import { StatusBadge } from "@/components/StatusBadge";

const POLL_MS = 2000;

export default function JobStatusPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<JobDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    async function tick() {
      try {
        const j = await fetchJob(id);
        if (!active) return;
        setJob(j);
        setError(null);
        // 進行中のみ継続ポーリング。
        if (j.state === "queued" || j.state === "running") {
          timer.current = setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "取得に失敗しました");
        timer.current = setTimeout(tick, POLL_MS * 2);
      }
    }
    tick();

    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const running = job?.state === "queued" || job?.state === "running";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 一覧
        </button>
        <h1 className="ml-1 truncate text-base font-bold">
          {job?.title ?? "ジョブ"}
        </h1>
      </header>

      {error && !job && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {job && (
        <>
          {/* 全体ステータス */}
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex items-center gap-2.5">
              <StateIcon state={job.state} />
              <div>
                <div className="text-sm font-semibold">{stateLabel(job.state)}</div>
                <div className="text-[11px] text-gray-400">
                  {job.progress.done}/{job.progress.total} シーン完了
                </div>
              </div>
            </div>
            {running && (
              <Loader2 size={18} className="animate-spin text-accent-soft" />
            )}
          </div>

          {job.error && (
            <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
              {job.error}
            </p>
          )}

          {/* 進捗バー */}
          {job.progress.total > 0 && (
            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{
                  width: `${(job.progress.done / job.progress.total) * 100}%`,
                }}
              />
            </div>
          )}

          {/* シーン別 */}
          <ul className="flex flex-col gap-2">
            {job.scenes.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1.5 rounded-xl border border-ink-700 bg-ink-900 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-gray-300">
                    #{s.order + 1} {s.subtitle}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <StatusBadge status={s.videoStatus} label="映像" />
                    <StatusBadge status={s.audioStatus} label="音声" />
                  </div>
                </div>

                {(s.videoError || s.audioError) && (
                  <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-red-300/90">
                    {s.videoError && <p>映像: {s.videoError}</p>}
                    {s.audioError && <p>音声: {s.audioError}</p>}
                  </div>
                )}

                {(s.videoUrl || s.audioUrl) && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {s.videoUrl && (
                      <a
                        href={s.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent-soft hover:underline"
                      >
                        映像を開く <ExternalLink size={11} />
                      </a>
                    )}
                    {s.audioUrl && (
                      <a
                        href={s.audioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent-soft hover:underline"
                      >
                        音声を開く <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 py-3 text-sm font-medium text-gray-200 hover:border-ink-600"
          >
            <RotateCw size={15} /> 新しい生成を投入
          </button>
        </>
      )}

      {!job && !error && (
        <div className="flex justify-center pt-10">
          <Loader2 className="animate-spin text-gray-500" />
        </div>
      )}
    </main>
  );
}

function StateIcon({ state }: { state: JobDTO["state"] }) {
  if (state === "completed")
    return <CheckCircle2 size={20} className="text-emerald-400" />;
  if (state === "failed") return <XCircle size={20} className="text-red-400" />;
  return <Loader2 size={20} className="animate-spin text-accent-soft" />;
}

function stateLabel(state: JobDTO["state"]): string {
  switch (state) {
    case "queued":
      return "待機中…";
    case "running":
      return "生成中…";
    case "completed":
      return "完了";
    case "failed":
      return "失敗";
  }
}
