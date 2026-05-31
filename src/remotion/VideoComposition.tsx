import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { FPS, VideoCompositionProps } from "./types";

/** ディゾルブのオーバーラップ尺（フレーム）。 */
const DISSOLVE_FRAMES = Math.round(FPS * 0.4);

/**
 * 結合済み動画のタイムライン（要件 3.2 シームレス連結）。
 *
 * 各シーンを Sequence で時系列に並べ、dissolve 指定のシーンは冒頭で
 * 不透明度を 0→1 に補間してクロスフェードさせる。実装版では色ブロックの
 * 代わりに各シーンの生成動画(<OffthreadVideo/>)とナレーション(<Audio/>)を載せる。
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
}) => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.map((scene) => {
        const from = Math.max(
          0,
          cursor - (scene.transition === "dissolve" ? DISSOLVE_FRAMES : 0)
        );
        cursor += scene.durationInFrames;
        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={
              scene.durationInFrames +
              (scene.transition === "dissolve" ? DISSOLVE_FRAMES : 0)
            }
          >
            <SceneLayer scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{
  scene: VideoCompositionProps["scenes"][number];
}> = ({ scene }) => {
  const frame = useCurrentFrame();
  const opacity =
    scene.transition === "dissolve"
      ? interpolate(frame, [0, DISSOLVE_FRAMES], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ backgroundColor: scene.color }} />
      {/* 字幕オーバーレイ */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: 44,
            lineHeight: 1.4,
            fontWeight: 600,
            padding: "20px 28px",
            borderRadius: 16,
            textAlign: "center",
            maxWidth: "90%",
          }}
        >
          {scene.subtitle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
