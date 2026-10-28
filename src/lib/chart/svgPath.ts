/**
 * Turning a series of plotted points into an SVG path.
 *
 * Split out of `IndicatorPane` so it can be exercised directly: the gap
 * behaviour below is the kind of thing that looks right on a chart with plenty
 * of history and is wrong precisely where it matters.
 */

export type PlotPoint = { x: number; y: number };

/**
 * A path that breaks where the maths had no answer.
 *
 * Indicators that are simply absent at the start — RSI before its first
 * window — can be drawn with a plain join, because the missing values are all
 * at one end. Stochastic and ADX can go null in the *middle*: a window whose
 * high equals its low has no %K at all, which is a different statement from
 * "the line was here and then moved somewhere else".
 *
 * Joining across such a hole draws a straight segment through bars where
 * nothing was computed, and a straight segment on an oscillator reads as a
 * measured trend. A null starts a new subpath instead, so the gap stays a gap.
 */
export function toSegmentedPath(points: ReadonlyArray<PlotPoint | null>): string {
  const parts: string[] = [];
  let penDown = false;

  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      penDown = false;
      continue;
    }
    parts.push(`${penDown ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
    penDown = true;
  }

  return parts.join(" ");
}
