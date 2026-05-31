import { TransitionType } from "@/lib/types";

/**
 * Remotion コンポジションへ渡す props（要件 3.2 の結合パラメータ）。
 * Remotion の Composition は props が Record<string, unknown> に代入可能である
 * ことを要求するため、interface ではなく type で定義する。
 */
export type VideoCompositionProps = {
  title: string;
  scenes: {
    id: string;
    subtitle: string;
    durationInFrames: number;
    transition: TransitionType;
    color: string;
  }[];
  bgmEnabled: boolean;
  duckingAmount: number;
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920; // 9:16 縦型
