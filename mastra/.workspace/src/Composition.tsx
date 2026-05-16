import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const composition = {
  durationInFrames: 300,
  fps: 30,
  width: 1280,
  height: 720,
};

const confettiColors = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7ff",
  "#007aff",
  "#af52de",
  "#ff2d55",
];

const confettiPieces = Array.from({ length: 64 }).map((_, i) => {
  const xBase = (i * 97) % 1280;
  const yOffset = -((i * 53) % 500) - 40;
  const drift = ((i % 9) - 4) * 20;
  const rotateBase = (i * 31) % 360;

  return {
    width: 10 + (i % 6) * 3,
    height: 8 + (i % 5) * 4,
    xBase,
    yOffset,
    drift,
    rotateBase,
    color: confettiColors[i % confettiColors.length],
    delay: (i % 10) * 2,
  };
});

const projectText = "A multi-agent system that turns natural language prompts into editable Remotion video code with live preview";

const teamNames = [
  "Abdelhamid Samy",
  "Sajda Esmat",
  "Fatma Sabry",
  "Esraa Ibrahim",
  "Mohamed Ali",
  "Abdullah Mohamed",
  "Fares Mamdouh",
];

const nameColors = ["#ff4d6d", "#ff9f1c", "#ffe66d", "#2ec4b6", "#00bbf9", "#9b5de5", "#f15bb5"];

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introSpring = spring({
    frame,
    fps,
    config: {
      damping: 14,
      stiffness: 120,
      mass: 0.8,
    },
  });

  const textOpacity = interpolate(frame, [0, 10, 52, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textTranslateY = interpolate(frame, [0, 24], [40, 0], {
    extrapolateRight: "clamp",
  });

  const bgShift = interpolate(frame, [0, 60], [0, 100], {
    extrapolateRight: "clamp",
  });

  const scene2Frame = frame - 60;
  const scene2Visible = scene2Frame >= 0 && scene2Frame <= 90;

  const scene2Opacity = interpolate(scene2Frame, [0, 10, 80, 90], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scene2TitleSpring = spring({
    frame: Math.max(0, scene2Frame),
    fps,
    config: {
      damping: 12,
      stiffness: 110,
      mass: 0.9,
    },
  });

  const scene2BodyOpacity = interpolate(scene2Frame, [16, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scene2BodyTranslateY = interpolate(scene2Frame, [10, 36], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scene2Hue = interpolate(scene2Frame, [0, 90], [160, 280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scene3Frame = frame - 150;
  const scene3Visible = scene3Frame >= 0 && scene3Frame <= 90;

  const scene3Opacity = interpolate(scene3Frame, [0, 8, 84, 90], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const nameSlot = Math.floor(scene3Frame / 12);
  const safeNameIndex = Math.min(Math.max(nameSlot, 0), teamNames.length - 1);
  const activeName = teamNames[safeNameIndex];
  const activeColor = nameColors[safeNameIndex % nameColors.length];

  const scene3NameSpring = spring({
    frame: Math.max(0, scene3Frame % 12),
    fps,
    config: {
      damping: 10,
      stiffness: 150,
      mass: 0.7,
    },
  });

  const scene3HeadingOpacity = interpolate(scene3Frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scene3Hue = interpolate(scene3Frame, [0, 90], [300, 60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${bgShift}, 90%, 60%), hsl(${(bgShift + 80) % 360}, 92%, 62%), hsl(${(bgShift + 170) % 360}, 88%, 58%))`,
      }}
      className="items-center justify-center overflow-hidden"
    >
      {confettiPieces.map((piece, idx) => {
        const pieceFrame = Math.max(0, frame - piece.delay);
        const drop = interpolate(pieceFrame, [0, 60], [piece.yOffset, 760], {
          extrapolateRight: "clamp",
        });
        const sway = Math.sin((pieceFrame + idx * 3) / 8) * piece.drift;
        const rotate = piece.rotateBase + pieceFrame * (2 + (idx % 3));

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: piece.xBase + sway,
              top: drop,
              width: piece.width,
              height: piece.height,
              borderRadius: 2,
              backgroundColor: piece.color,
              transform: `rotate(${rotate}deg) scale(${0.8 + introSpring * 0.2})`,
              opacity: 0.95,
            }}
          />
        );
      })}

      <div
        className="font-black tracking-tight text-white"
        style={{
          fontSize: 148,
          textShadow: "0 16px 40px rgba(0,0,0,0.35)",
          opacity: textOpacity,
          transform: `translateY(${textTranslateY}px) scale(${0.82 + introSpring * 0.18})`,
        }}
      >
        We Did It!
      </div>

      {scene2Visible ? (
        <AbsoluteFill
          className="items-center justify-center px-20"
          style={{
            opacity: scene2Opacity,
            background: `radial-gradient(circle at 20% 20%, hsla(${scene2Hue}, 95%, 72%, 0.45), transparent 42%), radial-gradient(circle at 80% 35%, hsla(${(scene2Hue + 80) % 360}, 95%, 68%, 0.4), transparent 45%), linear-gradient(130deg, rgba(22,10,55,0.58), rgba(9,40,85,0.55))`,
          }}
        >
          <div
            className="text-white text-center font-bold uppercase tracking-[0.32em]"
            style={{
              fontSize: 32,
              textShadow: "0 8px 20px rgba(0,0,0,0.35)",
              transform: `scale(${0.84 + scene2TitleSpring * 0.16})`,
            }}
          >
            Project Highlight
          </div>

          <div
            className="mt-10 max-w-5xl text-center font-extrabold text-white leading-tight"
            style={{
              fontSize: 58,
              lineHeight: 1.12,
              opacity: scene2BodyOpacity,
              transform: `translateY(${scene2BodyTranslateY}px) scale(${0.9 + scene2TitleSpring * 0.1})`,
              textShadow: "0 14px 36px rgba(0,0,0,0.38)",
            }}
          >
            {projectText}
          </div>
        </AbsoluteFill>
      ) : null}

      {scene3Visible ? (
        <AbsoluteFill
          className="items-center justify-center"
          style={{
            opacity: scene3Opacity,
            background: `radial-gradient(circle at 18% 25%, hsla(${scene3Hue}, 98%, 72%, 0.38), transparent 45%), radial-gradient(circle at 82% 30%, hsla(${(scene3Hue + 120) % 360}, 98%, 68%, 0.36), transparent 42%), linear-gradient(145deg, rgba(38,12,70,0.68), rgba(16,44,98,0.62))`,
          }}
        >
          <div
            className="text-white text-center font-bold uppercase tracking-[0.28em]"
            style={{
              fontSize: 30,
              opacity: scene3HeadingOpacity,
              textShadow: "0 8px 20px rgba(0,0,0,0.35)",
            }}
          >
            Team Celebration
          </div>

          <div
            className="mt-12 px-16 text-center font-black"
            style={{
              fontSize: 112,
              color: activeColor,
              textShadow: "0 14px 34px rgba(0,0,0,0.42)",
              transform: `translateY(${interpolate(scene3Frame % 12, [0, 12], [28, 0], { extrapolateRight: "clamp" })}px) scale(${0.82 + scene3NameSpring * 0.18})`,
              opacity: interpolate(scene3Frame % 12, [0, 3, 10, 12], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {activeName}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
