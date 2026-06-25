import React from "react";
import styles from "../styles/analyses.module.css";
import { AnalysisCard } from "./AnalysisCard";

export function AnalysesGrid({ analyses, onOpen, highlightedIds }) {
  if (!analyses.length) {
    return <div className={styles.emptyGrid}>No analyses match these filters.</div>;
  }
  return (
    <div className={styles.grid}>
      {analyses.map((a) => (
        <AnalysisCard
          key={a.id}
          analysis={a}
          onOpen={onOpen}
          highlighted={highlightedIds && highlightedIds.includes(a.id)}
        />
      ))}
    </div>
  );
}

export default AnalysesGrid;
