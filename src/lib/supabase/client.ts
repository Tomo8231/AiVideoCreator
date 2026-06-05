/**
 * Supabase ブラウザクライアント（シングルトン）。
 *
 * env が未設定なら null を返し、アプリは従来どおり localStorage / モックで動作する
 * （= キー無しでも壊れない）。キーを設定すると認証・DB・Storage が有効になる。
 *
 * 認証セッションはブラウザの localStorage に保存され、RLS により各ユーザーは
 * 自分のデータのみ読み書きできる（要件 4 セキュリティ）。
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase が設定済みか（URL と anon キーの両方がある）。 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** 設定済みなら Supabase クライアントを返す。未設定なら null。 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

/** ストレージのバケット名（schema.sql と一致させる）。 */
export const MEDIA_BUCKET = "media";
