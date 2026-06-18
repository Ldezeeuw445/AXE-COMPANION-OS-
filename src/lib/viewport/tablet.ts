/** True mouse desktop — fine pointer on a large screen (not iPad Pro). */
export function isMouseDesktopLayout(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 1280 || h < 720) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  return fine && !coarse;
}

/** Touch tablet / iPad — uses landscape shell, not mouse desktop layout. */
export function isTabletViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (window.innerWidth < 768) return false;
  if (isMouseDesktopLayout()) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function isTabletLandscape(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(orientation: landscape)").matches;
}

/** Active tablet chart layout — touch tablet in landscape only. */
export function isTabletChartLayout(): boolean {
  return isTabletViewport() && isTabletLandscape();
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

export function lockTabletLandscape(): void {
  if (typeof window === "undefined") return;
  try {
    const s = screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
    s.orientation?.lock?.("landscape-primary")?.catch(() => {});
  } catch {
    /* not supported */
  }
}

export function unlockTabletLandscape(): void {
  if (typeof window === "undefined") return;
  try {
    const s = screen as unknown as { orientation?: { unlock?: () => void } };
    s.orientation?.unlock?.();
  } catch {
    /* not supported */
  }
}
