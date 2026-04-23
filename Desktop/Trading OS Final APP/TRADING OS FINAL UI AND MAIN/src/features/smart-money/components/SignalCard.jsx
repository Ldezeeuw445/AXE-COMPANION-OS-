import React from "react";
import styles from "../styles/smart-money.module.css";
import {
  formatNotional,
  relativeTime,
  DIRECTION_COLOR,
} from "../utils/format";
import { ScoreGauge } from "./ScoreGauge";
import { ChannelDots } from "./ChannelDots";

/**
 * Banner variant: horizontal card designed to scroll in a row.
 */
export function SignalCard({ signal, onClick, active }) {
  const color = DIRECTION_COLOR[signal.direction];
  return (
    <button
      type="button"
      className={styles.card}
      data-active={active ? "true" : undefined}
      onClick={() => onClick && onClick(signal)}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardSymbol}>{signal.symbol}</span>
        <span className={styles.cardScore} style={{ color }}>
          {signal.score > 0 ? "+" : ""}
          {signal.score}
        </span>
      </div>
      <ScoreGauge score={signal.score} direction={signal.direction} size="sm" />
      <div className={styles.cardReason}>
        {signal.reasons[0] || "No recent activity"}
      </div>
      <div className={styles.cardMeta}>
        <ChannelDots channels={signal.channels} />
        <span className={styles.cardNotional}>
          {formatNotional(signal.totalNotionalUsd)}
        </span>
        <span className={styles.cardAgo}>{relativeTime(signal.updatedAt)}</span>
      </div>
    </button>
  );
}

export default SignalCard;
