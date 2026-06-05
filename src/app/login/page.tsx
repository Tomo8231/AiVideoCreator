"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogIn, Loader2, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { configured, signIn, signUp, error } = useAuthStore();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const ok = await signIn(email, password);
        if (ok) router.push("/");
      } else {
        const ok = await signUp(email, password);
        if (ok) {
          setNotice(
            "確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。"
          );
          setMode("signin");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-6">
      <header className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft size={16} /> 戻る
        </button>
        <h1 className="ml-1 text-lg font-bold">
          {mode === "signin" ? "ログイン" : "新規登録"}
        </h1>
      </header>

      {!configured ? (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200/90">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">Supabase が未設定です。</p>
            <p className="mt-1 text-[13px]">
              <code>NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を設定するとログインが有効に
              なります。未設定でもアプリはこの端末内（localStorage）で利用できます。
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-300">メールアドレス</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-300">パスワード</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-sm outline-none focus:border-accent"
            />
          </label>

          {error && <p className="text-[13px] text-red-400">{error}</p>}
          {notice && <p className="text-[13px] text-emerald-300">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-accent-soft disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            {mode === "signin" ? "ログイン" : "登録する"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setNotice(null);
            }}
            className="text-center text-xs text-gray-400 hover:text-gray-200"
          >
            {mode === "signin"
              ? "アカウントがない場合はこちら（新規登録）"
              : "すでにアカウントをお持ちの方（ログイン）"}
          </button>
        </form>
      )}
    </main>
  );
}
