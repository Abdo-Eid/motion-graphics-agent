import "./index.css";
import { Composition } from "remotion";
import { MyComposition, composition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={composition.durationInFrames}
        fps={composition.fps}
        width={composition.width}
        height={composition.height}
      />
    </>
  );
};