"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** APIキー入力欄（マスク表示の切替付き）。 */
export function KeyField({
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 pr-11 text-sm outline-none focus:border-accent"
        />
        {value && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-300"
            aria-label={show ? "隠す" : "表示"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <span className="text-[11px] leading-relaxed text-gray-500">{hint}</span>}
    </label>
  );
}
