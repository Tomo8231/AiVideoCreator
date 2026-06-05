/**
 * プロジェクトの永続化リポジトリ（Supabase DB）。
 *
 * RLS により各ユーザーは自分の行のみ読み書きできる（schema.sql 参照）。
 * Supabase 未設定時は呼ばれない想定（呼び出し側が configured を確認する）。
 */

import { Project } from "../types";
import { getSupabase } from "./client";

const TABLE = "projects";

/** 一覧表示用の軽量メタ情報。 */
export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  data: Project;
  updated_at: string;
}

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase が設定されていません");
  return supabase;
}

/** 現在のプロジェクトを upsert（新規/更新）。 */
export async function saveProject(userId: string, project: Project): Promise<void> {
  const supabase = requireClient();
  const row: ProjectRow = {
    id: project.id,
    user_id: userId,
    title: project.title,
    data: project,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/** 自分のプロジェクト一覧（更新が新しい順）。 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    updatedAt: r.updated_at as string,
  }));
}

/** 1 件読み込み。 */
export async function loadProject(id: string): Promise<Project | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as Project | undefined) ?? null;
}

/** 削除。 */
export async function deleteProject(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
