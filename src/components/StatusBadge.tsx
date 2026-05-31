import { GenerationStatus } from "@/lib/types";

const LABEL: Record<GenerationStatus, string> = {
  pending: "待機",
  generating: "生成中",
  ready: "完了",
  failed: "失敗",
};

const STYLE: Record<GenerationStatus, string> = {
  pending: "bg-ink-700 text-gray-300",
  generating: "bg-amber-500/20 text-amber-300 animate-pulse",
  ready: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
};

/** 生成ジョブの状態を小さなバッジで表示する。 */
export function StatusBadge({
  status,
  label,
}: {
  status: GenerationStatus;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLE[status]}`}
    >
      {label ? `${label}:` : ""}
      {LABEL[status]}
    </span>
  );
}
