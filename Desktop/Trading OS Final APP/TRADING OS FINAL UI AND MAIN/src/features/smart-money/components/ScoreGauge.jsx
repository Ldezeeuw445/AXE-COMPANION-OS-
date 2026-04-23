import React from "react";
import styles from "../styles/smart-money.module.css";
import { DIRECTION_COLOR } from "../utils/format";

/**
 * Compact diverging score bar. Center = 0, fills left (red) or right (green).
 */
export function ScoreGauge({ score, direction, size = "md" }) {
  const abs = Math.min(100, Math.abs(score));
  const color = DIRECTION_COLOR[direction];
  const width = abs + "%";
  const alignRight = direction === "bearish";
  return (
    <div className={styles.gauge} data-size={size}>
      <div className={styles.gaugeTrack}>
        <div
          className={styles.gaugeFill}
          style={{
            width,
            backgroundColor: color,
            right: alignRight ? "50%" : "auto",
            left: alignRight ? "auto" : "50%",
          }}
        />
        <div className={styles.gaugeCenter} />
      </div>
    </div>
  );
}

export default ScoreGauge;
