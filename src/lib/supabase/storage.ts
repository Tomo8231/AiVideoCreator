/**
 * メディアの Supabase Storage 保存（要件 4）。
 *
 * 各ユーザーは自分のフォルダ（`${userId}/...`）にのみ書き込めるよう RLS で制限する
 * （schema.sql 参照）。読み取りは署名付きURLで一時的に許可し、非公開を保つ。
 */

import { getSupabase, MEDIA_BUCKET } from "./client";
import { uid } from "../sceneSplit";

/** 署名付きURLの有効秒数（RunWay 等が取得する間に十分な長さ）。 */
const SIGN_EXPIRES = 60 * 60; // 1時間

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

/**
 * 画像を Storage にアップロードし、署名付きURLを返す。
 * @param userId 認証ユーザーID（保存先フォルダ）
 * @param file   画像ファイル
 */
export async function uploadSeedImage(
  userId: string,
  file: File
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase が設定されていません");

  const path = `${userId}/seeds/${uid()}.${extFromMime(file.type)}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);

  const { data, error: signErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGN_EXPIRES);
  if (signErr || !data?.signedUrl) {
    throw new Error(signErr?.message ?? "署名付きURLの発行に失敗しました");
  }
  return data.signedUrl;
}
