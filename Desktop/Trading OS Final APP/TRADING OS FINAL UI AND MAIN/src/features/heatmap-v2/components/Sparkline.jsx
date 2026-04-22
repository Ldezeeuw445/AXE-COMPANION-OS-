import React from "react";

/**
 * Tiny inline SVG sparkline. No dependencies.
 */
export function Sparkline({ values, width = 140, height = 32, stroke = "#e8ecef" }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "#1fbf75" : "#e5484d"}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
    </svg>
  );
}

export default Sparkline;
