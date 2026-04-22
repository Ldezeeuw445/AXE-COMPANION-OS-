import React from "react";
import styles from "../styles/analyses.module.css";
import { relativeTime } from "../utils/format";

/**
 * Top "Today's Key Thesis" card. Single prominent block at top of library.
 */
export function TodaysThesisCard({ thesis, analysis, onOpen }) {
  if (!thesis || !analysis) {
    return (
      <div className={styles.thesisCard} data-empty>
        <div className={styles.thesisLabel}>TODAY'S KEY THESIS</div>
        <div className={styles.thesisHeadline}>No thesis selected yet</div>
        <div className={styles.thesisRationale}>
          Publish an analysis or pin one as today's thesis.
        </div>
      </div>
    );
  }

  const dots = "●●●●●".slice(0, thesis.confidence);
  const dim = "●●●●●".slice(thesis.confidence);

  return (
    <button
      type="button"
      className={styles.thesisCard}
      onClick={() => onOpen && onOpen(analysis)}
    >
      <div className={styles.thesisHead}>
        <span className={styles.thesisLabel}>TODAY'S KEY THESIS</span>
        <span className={styles.thesisConfidence}>
          CONVICTION{" "}
          <span className={styles.thesisDotsOn}>{dots}</span>
          <span className={styles.thesisDotsOff}>{dim}</span>
        </span>
      </div>
      <div className={styles.thesisHeadline}>{thesis.headline}</div>
      <div className={styles.thesisRationale}>{thesis.rationale}</div>
      <div className={styles.thesisFooter}>
        <span className={styles.thesisSymbols}>
          {analysis.symbols.slice(0, 4).map((s) => (
            <span key={s} className={styles.thesisSymbol}>
              {s}
            </span>
          ))}
        </span>
        <span className={styles.thesisUpdated}>
          UPDATED {relativeTime(analysis.updatedAt).toUpperCase()}
        </span>
      </div>
    </button>
  );
}

export default TodaysThesisCard;
