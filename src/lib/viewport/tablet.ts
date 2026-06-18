/** Tablet = wide enough for persistent left rail, but not full desktop layout. */
export function isTabletViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 768;
}

/** Phone-only landscape immersive — excludes tablets (iPad, etc.). */
export function isPhoneLandscapeViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (window.innerWidth >= 768) return false;
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  if (!landscape) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const short = window.matchMedia("(max-height: 520px)").matches;
  return coarse || short || window.innerHeight < 520;
}
