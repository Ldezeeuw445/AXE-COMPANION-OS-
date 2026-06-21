import React from "react";
import styles from "../styles/smart-money.module.css";
import { CHANNEL_COLOR, CHANNEL_LABEL } from "../utils/format";

/**
 * Row of channel tags showing which feeds contributed to a signal.
 * Example: [POL] [OPT] [DPL]
 */
export function ChannelDots({ channels }) {
  return (
    <div className={styles.channels}>
      {channels.map((c) => (
        <span
          key={c}
          className={styles.channelTag}
          style={{ color: CHANNEL_COLOR[c] }}
          title={c}
        >
          {CHANNEL_LABEL[c]}
        </span>
      ))}
    </div>
  );
}

export default ChannelDots;
