"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
} from "lucide-react";
import { JobSummary } from "@/lib/jobs";
import { fetchJobs } from "@/lib/jobsClient";

export default function JobsListPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchJobs());
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 一覧も軽くポーリングして進行中ジョブの状態を更新。
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="ml-1 flex-1 text-lg font-bold">ジョブ履歴</h1>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2 text-gray-400 hover:text-gray-200"
          aria-label="更新"
        >
          <RefreshCw size={18} />
        </button>
      </header>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center pt-10">
          <Loader2 className="animate-spin text-gray-500" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 pt-12 text-center">
          <p className="text-sm text-gray-500">まだジョブがありません。</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-soft"
          >
            <Plus size={16} /> 生成を投入
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => router.push(`/jobs/${j.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3 text-left hover:border-ink-600"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StateIcon state={j.state} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{j.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(j.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                  {j.progress.done}/{j.progress.total}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StateIcon({ state }: { state: JobSummary["state"] }) {
  if (state === "completed")
    return <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />;
  if (state === "failed")
    return <XCircle size={18} className="shrink-0 text-red-400" />;
  if (state === "running")
    return <Loader2 size={18} className="shrink-0 animate-spin text-accent-soft" />;
  return <Clock size={18} className="shrink-0 text-gray-400" />;
}
