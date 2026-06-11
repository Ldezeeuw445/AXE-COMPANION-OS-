/**
 * LandingHeroBackdrop
 *
 * The premium Huly-style ambient layer for the hero: a deep black base,
 * two slowly drifting cyan/teal aurora blobs, a sweeping conic "glow up"
 * beam from the top, and a perspective grid floor that fades upward.
 * Purely decorative — pointer-events none, aria-hidden.
 */
export function LandingHeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      {/* Sweeping beam from the top center */}
      <div className="axe-hero-beam absolute -top-40 left-1/2 h-[760px] w-[1100px] -translate-x-1/2" />

      {/* Drifting aurora blobs */}
      <div
        className="axe-aurora-a absolute -top-24 left-[12%] h-[460px] w-[460px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0.08) 42%, transparent 70%)",
          filter: "blur(46px)",
        }}
      />
      <div
        className="axe-aurora-b absolute -top-10 right-[8%] h-[420px] w-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.24) 0%, rgba(45,212,191,0.06) 44%, transparent 72%)",
          filter: "blur(52px)",
        }}
      />
      <div
        className="axe-aurora-a absolute top-[42%] left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(34,211,238,0.10) 0%, transparent 64%)",
          filter: "blur(60px)",
        }}
      />

      {/* Perspective grid floor */}
      <div className="absolute inset-x-0 top-[180px] h-[640px]">
        <div className="axe-grid-floor h-full w-full" />
      </div>

      {/* Vignette to keep edges deep black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(2,4,6,0.65) 100%)",
        }}
      />
    </div>
  );
}
