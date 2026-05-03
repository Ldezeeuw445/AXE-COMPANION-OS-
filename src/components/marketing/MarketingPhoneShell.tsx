import type { ReactNode } from "react";

type MarketingPhoneShellProps = {
  children: ReactNode;
  /** Subtle 3D tilt for hero shots */
  tilt?: boolean;
  /** Ref forward for Playwright clipping */
  shotId?: string;
  /** Override default width (e.g. poster grid) */
  frameClassName?: string;
};

export function MarketingPhoneShell({
  children,
  tilt = true,
  shotId,
  frameClassName = "w-[min(360px,92vw)]",
}: MarketingPhoneShellProps) {
  return (
    <div
      className={`relative mx-auto ${frameClassName} ${tilt ? "marketing-tilt" : ""}`}
      data-marketing-shot={shotId}
    >
      <div
        className="pointer-events-none absolute -inset-3 rounded-[2.75rem] opacity-50 blur-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(201,162,39,0.2), transparent 58%)",
        }}
        aria-hidden
      />
      <div className="relative rounded-[2.65rem] border border-white/[0.12] bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-[3px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)]">
        <div className="relative overflow-hidden rounded-[2.45rem] bg-tos-bg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
          {children}
        </div>
      </div>
      <div
        className="pointer-events-none absolute -bottom-8 left-6 right-6 h-10 rounded-[50%] opacity-[0.22] blur-xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(201,162,39,0.35), transparent 70%)",
        }}
        aria-hidden
      />
    </div>
  );
}
