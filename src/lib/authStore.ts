/**
 * 認証状態（Supabase Auth）を保持する Zustand ストア。
 *
 * Supabase 未設定なら常に未ログイン扱いで、アプリはローカル動作にフォールバックする。
 * 設定済みなら onAuthStateChange を購読し、ログイン状態を全画面で共有する。
 */

import { create } from "zustand";
import { getSupabase, isSupabaseConfigured } from "./supabase/client";

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthState {
  configured: boolean;
  /** 初期セッション確認が済むまで true。 */
  loading: boolean;
  user: AuthUser | null;
  /** 直近の認証エラーメッセージ。 */
  error: string | null;

  /** アプリ起動時に一度呼ぶ。セッション復元と購読を開始。 */
  init: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

let initialized = false;

export const useAuthStore = create<AuthState>((set) => ({
  configured: isSupabaseConfigured,
  loading: isSupabaseConfigured,
  user: null,
  error: null,

  init: () => {
    if (initialized) return;
    initialized = true;
    const supabase = getSupabase();
    if (!supabase) {
      set({ loading: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      set({
        loading: false,
        user: u ? { id: u.id, email: u.email ?? null } : null,
      });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      set({ user: u ? { id: u.id, email: u.email ?? null } : null });
    });
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return false;
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  signUp: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return false;
    set({ error: null });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  signOut: async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null });
  },
}));
