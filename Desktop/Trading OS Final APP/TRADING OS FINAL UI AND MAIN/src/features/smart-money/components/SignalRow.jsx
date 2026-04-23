import React from "react";
import styles from "../styles/smart-money.module.css";
import {
  formatNotional,
  relativeTime,
  DIRECTION_COLOR,
} from "../utils/format";
import { ChannelDots } from "./ChannelDots";

/**
 * Compact variant: dense row for the square panel next to charts.
 */
export function SignalRow({ signal, onClick, active }) {
  const color = DIRECTION_COLOR[signal.direction];
  return (
    <button
      type="button"
      className={styles.row}
      data-active={active ? "true" : undefined}
      onClick={() => onClick && onClick(signal)}
    >
      <div className={styles.rowHead}>
        <span className={styles.rowSymbol}>{signal.symbol}</span>
        <span className={styles.rowScore} style={{ color }}>
          {signal.score > 0 ? "+" : ""}
          {signal.score}
        </span>
      </div>
      <div className={styles.rowReason}>{signal.reasons[0] || "—"}</div>
      <div className={styles.rowMeta}>
        <ChannelDots channels={signal.channels} />
        <span className={styles.rowNotional}>
          {formatNotional(signal.totalNotionalUsd)} · {relativeTime(signal.updatedAt)}
        </span>
      </div>
    </button>
  );
}

export default SignalRow;
