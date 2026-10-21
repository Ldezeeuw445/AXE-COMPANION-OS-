/**
 * INTEL-FREE — FINRA short-volume row accent for the intel view.
 *
 * `shortRatio` is shortVolume / totalVolume (0..1), not short interest % of float.
 * Tunable: raise toward 0.45–0.50 for rarer/louder amber; lower toward 0.25 for denser highlights.
 */
export const SHORT_VOLUME_ELEVATED_RATIO = 0.4;

export type ShortVolumeRatioUi = {
  label: string;
  elevated: boolean;
  ratioClassName: string;
  rowClassName: string;
};

export function isElevatedShortVolumeRatio(
  shortRatio: number,
  threshold: number = SHORT_VOLUME_ELEVATED_RATIO,
): boolean {
  return Number.isFinite(shortRatio) && shortRatio >= threshold;
}

export function shortVolumeRatioUi(shortRatio: number): ShortVolumeRatioUi {
  const pct = Number.isFinite(shortRatio) ? Math.round(shortRatio * 100) : 0;
  const elevated = isElevatedShortVolumeRatio(shortRatio);

  return {
    label: `${pct}% short`,
    elevated,
    ratioClassName: elevated ? "text-amber-300" : "text-tos-muted",
    rowClassName: elevated ? "border-amber-300/25" : "border-white/[0.05]",
  };
}
