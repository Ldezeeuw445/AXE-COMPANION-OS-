import type { ReactNode } from "react";

type CubeProps = {
  label: string;
  sublabel?: string;
  tall?: boolean;
};

export function LandingCube({ label, sublabel, tall = false }: CubeProps) {
  return (
    <div className={`axe-landing-scene ${tall ? "axe-landing-scene--tall" : ""}`} aria-hidden>
      <div className={`axe-landing-cube3d ${tall ? "axe-landing-cube3d--tall" : ""}`}>
        <CubeFace extra="front">
          {label}
          {sublabel ? <span>{sublabel}</span> : null}
        </CubeFace>
        <CubeFace extra="back">
          {label}
          {sublabel ? <span>{sublabel}</span> : null}
        </CubeFace>
        <CubeFace extra="right" />
        <CubeFace extra="left" />
        <CubeFace extra="top" />
        <CubeFace extra="bottom" />
      </div>
    </div>
  );
}

function CubeFace({
  extra,
  children,
}: {
  extra: "front" | "back" | "right" | "left" | "top" | "bottom";
  children?: ReactNode;
}) {
  return (
    <span className={`axe-landing-cube3d-face axe-landing-cube3d-face--${extra}`}>{children}</span>
  );
}

export function LandingPyramid() {
  return (
    <div className="axe-landing-scene" aria-hidden>
      <div className="axe-landing-pyramid">
        <span className="axe-landing-pyramid-face axe-landing-pyramid-face--front" />
        <span className="axe-landing-pyramid-face axe-landing-pyramid-face--right" />
        <span className="axe-landing-pyramid-face axe-landing-pyramid-face--left" />
        <span className="axe-landing-pyramid-face axe-landing-pyramid-face--back" />
      </div>
    </div>
  );
}
