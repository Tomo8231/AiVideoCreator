"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Scene } from "@/lib/types";
import { formatMsShort } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

/**
 * シーンのタイムライン（要件 3.3 ドラッグ&ドロップで並び替え）。
 *
 * 各シーンの幅を尺に比例させ、ミリ秒単位の長さ感を視覚化する。
 * タップで選択、ドラッグハンドルで並び替え。タッチ操作にも対応。
 */
export function Timeline({
  scenes,
  selectedId,
  onSelect,
  onReorder,
}: {
  scenes: Scene[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = scenes.findIndex((s) => s.id === active.id);
    const to = scenes.findIndex((s) => s.id === over.id);
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  const maxDuration = Math.max(...scenes.map((s) => s.durationMs), 1);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={scenes.map((s) => s.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="thin-scroll flex gap-2 overflow-x-auto pb-2">
          {scenes.map((scene) => (
            <SortableCard
              key={scene.id}
              scene={scene}
              selected={scene.id === selectedId}
              widthPct={(scene.durationMs / maxDuration) * 100}
              onSelect={() => onSelect(scene.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({
  scene,
  selected,
  widthPct,
  onSelect,
}: {
  scene: Scene;
  selected: boolean;
  widthPct: number;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  // 幅は尺に比例（最小 120px、最大 200px の範囲にクランプ）。
  const width = Math.round(120 + (widthPct / 100) * 80);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width,
    opacity: isDragging ? 0.6 : 1,
  };

  const failed = scene.videoStatus === "failed" || scene.audioStatus === "failed";

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`relative flex shrink-0 flex-col gap-1.5 rounded-xl border p-2 text-left transition ${
        selected
          ? "border-accent bg-ink-800"
          : failed
          ? "border-red-500/50 bg-ink-900"
          : "border-ink-700 bg-ink-900 hover:border-ink-600"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-300">
          #{scene.order + 1}
        </span>
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-gray-500 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </span>
      </div>
      <div
        className="h-10 rounded-md"
        style={{ background: scene.previewColor }}
      />
      <p className="line-clamp-2 text-[11px] leading-snug text-gray-400">
        {scene.subtitle}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tabular-nums text-gray-500">
          {formatMsShort(scene.durationMs)}
        </span>
        {scene.transition !== "none" && (
          <span className="text-[9px] uppercase text-accent-soft">
            {scene.transition}
          </span>
        )}
      </div>
      {failed && (
        <div className="flex gap-1">
          <StatusBadge status={scene.videoStatus} />
        </div>
      )}
    </button>
  );
}
