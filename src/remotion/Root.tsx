import { Composition } from "remotion";
import { VideoComposition } from "./VideoComposition";
import { FPS, HEIGHT, WIDTH, VideoCompositionProps } from "./types";

const DEFAULT_PROPS: VideoCompositionProps = {
  title: "AIVideoCreator",
  scenes: [
    {
      id: "demo",
      subtitle: "サンプルシーン",
      durationInFrames: FPS * 3,
      transition: "none",
      color: "#7c5cff",
    },
  ],
  bgmEnabled: true,
  duckingAmount: 0.6,
};

/** Remotion のエントリ。durationInFrames は props から動的に算出する。 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={FPS * 3}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }) => {
        const total = props.scenes.reduce(
          (sum, s) => sum + s.durationInFrames,
          0
        );
        return { durationInFrames: Math.max(1, total) };
      }}
    />
  );
};
