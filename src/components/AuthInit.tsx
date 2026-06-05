"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/authStore";

/** アプリ起動時に一度だけ認証セッションの復元・購読を開始する。 */
export function AuthInit() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => init(), [init]);
  return null;
}
