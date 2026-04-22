import React from "react";
import styles from "../styles/analyses.module.css";
import {
  relativeTime,
  BIAS_COLOR,
  STATUS_LABEL,
  STATUS_COLOR,
  TAG_COLOR,
} from "../utils/format";
import { Sparkline } from "./Sparkline";

export function AnalysisCard({ analysis, onOpen, highlighted }) {
  const a = analysis;
  const pnl = a.pnlPct;
  const pnlDir = pnl == null ? "flat" : pnl > 0 ? "up" : pnl < 0 ? "down" : "flat";
  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onOpen && onOpen(a)}
      data-highlighted={highlighted ? "true" : undefined}
    >
      <div className={styles.cardHeader}>
        <span
          className={styles.cardBias}
          style={{ color: BIAS_COLOR[a.bias] }}
        >
          {a.bias.toUpperCase()}
        </span>
        <span
          className={styles.cardStatus}
          style={{ color: STATUS_COLOR[a.status] }}
        >
          {STATUS_LABEL[a.status]}
        </span>
      </div>

      <div className={styles.cardTitle}>{a.title}</div>
      <div className={styles.cardSummary}>{a.summary}</div>

      <div className={styles.cardSpark}>
        <Sparkline values={a.sparkline || []} height={42} />
      </div>

      <div className={styles.cardSymbols}>
        {a.symbols.slice(0, 3).map((s) => (
          <span key={s} className={styles.cardSymbol}>
            {s}
          </span>
        ))}
        {a.symbols.length > 3 ? (
          <span className={styles.cardSymbolMore}>+{a.symbols.length - 3}</span>
        ) : null}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardTags}>
          {a.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={styles.cardTag}
              style={{ color: TAG_COLOR[tag] }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className={styles.cardMeta}>
          {pnl != null ? (
            <span className={styles.cardPnl} data-direction={pnlDir}>
              {pnl > 0 ? "+" : ""}
              {pnl.toFixed(2)}%
            </span>
          ) : null}
          <span className={styles.cardUpdated}>
            {relativeTime(a.updatedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

export default AnalysisCard;
