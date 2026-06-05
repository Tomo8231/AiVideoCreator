"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CloudUpload,
  FolderOpen,
  Trash2,
  Loader2,
  LogIn,
  Check,
} from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { useAppStore } from "@/lib/store";
import {
  ProjectSummary,
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
} from "@/lib/supabase/projectsRepo";

export default function ProjectsPage() {
  const router = useRouter();
  const { configured, user, loading: authLoading } = useAuthStore();
  const project = useAppStore((s) => s.project);
  const setProject = useAppStore((s) => s.setProject);

  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : "一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSaveCurrent() {
    if (!user || !project) return;
    setError(null);
    try {
      await saveProject(user.id, project);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  async function handleLoad(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const p = await loadProject(id);
      if (p) {
        setProject(p);
        router.push("/editor");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteProject(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="ml-1 text-lg font-bold">クラウドのプロジェクト</h1>
      </header>

      {!configured ? (
        <Notice>
          Supabase が未設定のため、クラウド保存は利用できません。設定すると
          プロジェクトを端末間で同期できます。
        </Notice>
      ) : authLoading ? (
        <Centered>
          <Loader2 className="animate-spin text-gray-500" />
        </Centered>
      ) : !user ? (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <p className="text-sm text-gray-400">
            クラウド保存にはログインが必要です。
          </p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-soft"
          >
            <LogIn size={16} /> ログイン
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 現在のプロジェクトを保存 */}
          <button
            type="button"
            disabled={!project}
            onClick={handleSaveCurrent}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:opacity-40"
          >
            {saved ? <Check size={16} /> : <CloudUpload size={16} />}
            {saved
              ? "保存しました"
              : project
                ? `「${project.title}」をクラウドに保存`
                : "保存できるプロジェクトがありません"}
          </button>

          {error && <p className="text-[13px] text-red-400">{error}</p>}

          {/* 一覧 */}
          {loading ? (
            <Centered>
              <Loader2 className="animate-spin text-gray-500" />
            </Centered>
          ) : items.length === 0 ? (
            <p className="pt-6 text-center text-sm text-gray-500">
              まだ保存されたプロジェクトはありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(it.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() => handleLoad(it.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-gray-200 hover:border-ink-600 disabled:opacity-40"
                    >
                      {busyId === it.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <FolderOpen size={13} />
                      )}
                      開く
                    </button>
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() => handleDelete(it.id)}
                      className="inline-flex items-center rounded-lg border border-ink-700 px-2 py-1.5 text-xs text-red-400 hover:border-red-500/50 disabled:opacity-40"
                      aria-label="削除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] leading-relaxed text-amber-200/90">
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center pt-10">{children}</div>;
}
