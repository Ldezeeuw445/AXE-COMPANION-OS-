import React from "react";

export function Sparkline({ values, width = 180, height = 44 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M 0,${height} ${points
    .map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")} L ${width},${height} Z`;
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "#1fbf75" : "#e5484d";
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} fill={stroke} opacity={0.12} />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
      />
    </svg>
  );
}

export default Sparkline;
