import React from "react";
import styles from "../styles/heatmap.module.css";

const PERF_STOPS = [
  { color: "#7a1f24", label: "-6%" },
  { color: "#9e2a31", label: "-4%" },
  { color: "#b8383e", label: "-2%" },
  { color: "#5a2a2d", label: "-1%" },
  { color: "#2a2d31", label: "0" },
  { color: "#1f4a34", label: "+1%" },
  { color: "#226b43", label: "+2%" },
  { color: "#2a8c56", label: "+4%" },
  { color: "#2fa668", label: "+6%" },
  { color: "#1fbf75", label: "+" },
];

const VOL_STOPS = [
  { color: "#2a2d31", label: "<0.5" },
  { color: "#3a3d41", label: "0.8" },
  { color: "#4a4d51", label: "1.2" },
  { color: "#6b5a3a", label: "1.8" },
  { color: "#8c7535", label: "2.5" },
  { color: "#b8933a", label: "4" },
  { color: "#f5a524", label: ">4x" },
];

const PE_STOPS = [
  { color: "#2fa668", label: "<10" },
  { color: "#2a8c56", label: "15" },
  { color: "#226b43", label: "20" },
  { color: "#3a3d41", label: "25" },
  { color: "#5a2a2d", label: "35" },
  { color: "#8a3237", label: "50" },
  { color: "#9e2a31", label: ">50" },
];

export function Legend({ metric }) {
  const stops =
    metric === "volume" ? VOL_STOPS : metric === "pe" ? PE_STOPS : PERF_STOPS;
  return (
    <div className={styles.legend}>
      <span className={styles.legendLabel}>
        {metric === "volume"
          ? "REL VOL"
          : metric === "pe"
          ? "P/E"
          : "PERFORMANCE"}
      </span>
      <div className={styles.legendScale}>
        {stops.map((s) => (
          <div key={s.label} className={styles.legendStop}>
            <span
              className={styles.legendSwatch}
              style={{ backgroundColor: s.color }}
            />
            <span className={styles.legendStopLabel}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Legend;
