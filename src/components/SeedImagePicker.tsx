"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { uploadSeedImage } from "@/lib/supabase/storage";

/**
 * 起点画像（RunWay image_to_video 用）の選択コンポーネント。
 *
 * ログイン済み（Supabase 設定済み）なら Storage にアップロードして署名付きURLを、
 * そうでなければ data URL を返す。SceneInspector とホーム入力の双方で使う。
 */
export function SeedImagePicker({
  value,
  onChange,
  hint,
  thumbClassName = "h-16 w-16",
}: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  hint?: string;
  thumbClassName?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const authUser = useAuthStore((s) => s.user);
  const authConfigured = useAuthStore((s) => s.configured);

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("画像サイズは 4MB 以下にしてください");
      return;
    }

    setUploading(true);
    try {
      if (authConfigured && authUser) {
        onChange(await uploadSeedImage(authUser.id, file));
      } else {
        onChange(await readAsDataUrl(file));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      // 同じファイルを選び直せるよう input をリセット。
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-3">
          {/* data URL / 署名付きURL を表示するため next/image ではなく img を使用 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="起点画像"
            className={`shrink-0 rounded-lg border border-ink-700 object-cover ${thumbClassName}`}
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="self-start rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-ink-600 disabled:opacity-50"
            >
              {uploading ? "アップロード中…" : "差し替え"}
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex items-center gap-1 self-start text-xs text-red-400 hover:text-red-300"
            >
              <X size={12} /> 削除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 px-3 py-3 text-xs text-gray-400 transition enabled:hover:border-accent enabled:hover:text-gray-200 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ImagePlus size={15} />
          )}
          {uploading ? "アップロード中…" : "画像を追加（任意）"}
        </button>
      )}

      {error && <span className="text-[11px] text-red-400">{error}</span>}
      {hint && (
        <span className="text-[11px] leading-relaxed text-gray-500">{hint}</span>
      )}
    </div>
  );
}
