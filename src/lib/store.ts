/**
 * アプリ全体の状態（プロジェクト1本ぶん）を保持する Zustand ストア。
 *
 * - localStorage に永続化し、トップページ→エディタ間のクライアント遷移でも保持する。
 * - 生成オーケストレーション（動画/音声の非同期キック）もここに集約し、
 *   コンポーネントは「意図（generate / retake / reorder…）」を呼ぶだけにする。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Project, Scene } from "./types";
import { uid } from "./sceneSplit";
import { requestAudio, requestSplit, requestVideo } from "./aiService";

interface AppState {
  project: Project | null;

  /** 台本から新規プロジェクトを作成し、シーン分割する（要件 3.1）。 */
  createProjectFromScript: (title: string, script: string) => Promise<void>;
  /** プロジェクトを破棄して最初からやり直す。 */
  resetProject: () => void;

  /** 全シーンの動画+音声生成を非同期にキック（要件 3.1 同時キック / Queue）。 */
  generateAll: () => Promise<void>;
  /** 単一シーンを（新しいプロンプトで）作り直す（要件 3.3 部分再生成）。 */
  retakeScene: (sceneId: string, newPrompt?: string) => Promise<void>;

  /** シーンの並び替え（要件 3.3 ドラッグ&ドロップ）。 */
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  /** シーンの任意フィールドを更新（字幕修正・トリミング・トランジション等）。 */
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;
  /** シーン削除。 */
  removeScene: (sceneId: string) => void;

  /** BGM / ダッキング設定（要件 3.2）。 */
  setBgmEnabled: (enabled: boolean) => void;
  setDuckingAmount: (amount: number) => void;
}

function reindex(scenes: Scene[]): Scene[] {
  return scenes.map((s, i) => ({ ...s, order: i }));
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      project: null,

      createProjectFromScript: async (title, script) => {
        const scenes = await requestSplit(script);
        const project: Project = {
          id: uid(),
          title: title.trim() || "無題のプロジェクト",
          script,
          scenes,
          bgmEnabled: true,
          duckingAmount: 0.6,
          createdAt: Date.now(),
        };
        set({ project });
      },

      resetProject: () => set({ project: null }),

      generateAll: async () => {
        const project = get().project;
        if (!project) return;

        // 全シーンを generating に。
        set({
          project: {
            ...project,
            scenes: project.scenes.map((s) => ({
              ...s,
              videoStatus: "generating",
              audioStatus: "generating",
            })),
          },
        });

        // 各シーンの動画・音声を「同時キック」。完了ごとに個別に状態反映する。
        await Promise.all(
          project.scenes.flatMap((scene) => [
            requestVideo(scene).then((r) =>
              get().updateScene(scene.id, {
                videoStatus: r.ok ? "ready" : "failed",
              })
            ),
            requestAudio(scene).then((r) =>
              get().updateScene(scene.id, {
                audioStatus: r.ok ? "ready" : "failed",
              })
            ),
          ])
        );
      },

      retakeScene: async (sceneId, newPrompt) => {
        const apply = (patch: Partial<Scene>) =>
          get().updateScene(sceneId, patch);

        const current = get().project?.scenes.find((s) => s.id === sceneId);
        if (!current) return;

        const prompt = newPrompt ?? current.videoPrompt;
        apply({ videoPrompt: prompt, videoStatus: "generating", audioStatus: "generating" });

        const target: Scene = { ...current, videoPrompt: prompt };
        const [v, a] = await Promise.all([
          requestVideo(target),
          requestAudio(target),
        ]);
        apply({
          videoStatus: v.ok ? "ready" : "failed",
          audioStatus: a.ok ? "ready" : "failed",
        });
      },

      reorderScenes: (fromIndex, toIndex) => {
        const project = get().project;
        if (!project) return;
        const scenes = [...project.scenes];
        const [moved] = scenes.splice(fromIndex, 1);
        scenes.splice(toIndex, 0, moved);
        set({ project: { ...project, scenes: reindex(scenes) } });
      },

      updateScene: (sceneId, patch) => {
        const project = get().project;
        if (!project) return;
        set({
          project: {
            ...project,
            scenes: project.scenes.map((s) =>
              s.id === sceneId ? { ...s, ...patch } : s
            ),
          },
        });
      },

      removeScene: (sceneId) => {
        const project = get().project;
        if (!project) return;
        const scenes = project.scenes.filter((s) => s.id !== sceneId);
        set({ project: { ...project, scenes: reindex(scenes) } });
      },

      setBgmEnabled: (enabled) => {
        const project = get().project;
        if (!project) return;
        set({ project: { ...project, bgmEnabled: enabled } });
      },

      setDuckingAmount: (amount) => {
        const project = get().project;
        if (!project) return;
        set({
          project: {
            ...project,
            duckingAmount: Math.min(1, Math.max(0, amount)),
          },
        });
      },
    }),
    {
      name: "aivideocreator-project",
      // SSR/静的書き出し時に window が無いため、storage アクセスはクライアントのみ。
      skipHydration: false,
    }
  )
);
