import React from "react";
import styles from "../styles/heatmap.module.css";
import { cx, TIMEFRAMES, METRIC_MODES } from "../utils/format";

export function Toolbar({
  timeframe,
  onTimeframeChange,
  metric,
  onMetricChange,
  asOf,
  onRefresh,
  loading,
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <span className={styles.toolbarLabel}>TIMEFRAME</span>
        <div className={styles.segmented}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              className={cx(styles.segBtn, timeframe === tf && styles.segBtnActive)}
              onClick={() => onTimeframeChange(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.toolbarRight}>
        <span className={styles.toolbarLabel}>COLOR BY</span>
        <div className={styles.segmented}>
          {METRIC_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={cx(styles.segBtn, metric === m.id && styles.segBtnActive)}
              onClick={() => onMetricChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={onRefresh}
          disabled={loading}
          title="Refresh snapshot"
        >
          {loading ? "..." : "↻"}
        </button>
        {asOf ? (
          <span className={styles.asOf}>
            {new Date(asOf).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default Toolbar;
