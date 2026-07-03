/** Tiny lock / unlock glyphs for chart annotation controls (SVG). */
export function LockIconSvg({
  locked,
  x,
  y,
  size = 10,
  fill,
}: {
  locked: boolean;
  x: number;
  y: number;
  size?: number;
  fill: string;
}) {
  const s = size / 12;
  const tx = x - size / 2;
  const ty = y - size / 2 + 1;
  if (locked) {
    return (
      <g transform={`translate(${tx}, ${ty}) scale(${s})`} fill="none" stroke={fill} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="6" height="5" rx="1" fill={fill} fillOpacity={0.15} />
        <path d="M4.5 5V3.8a1.5 1.5 0 0 1 3 0V5" />
      </g>
    );
  }
  return (
    <g transform={`translate(${tx}, ${ty}) scale(${s})`} fill="none" stroke={fill} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="5" rx="1" fill={fill} fillOpacity={0.08} />
      <path d="M4.5 5V3.8a1.5 1.5 0 0 1 3 0" />
    </g>
  );
}
