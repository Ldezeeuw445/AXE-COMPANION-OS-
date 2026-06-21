import React from "react";
import styles from "../styles/analyses.module.css";
import { cx, TAG_COLOR } from "../utils/format";

const TAGS = ["FX", "Stocks", "Crypto", "Macro", "Energy", "Tech", "Rates", "Commodities"];

export function TagFilters({ active, onToggle, onClear }) {
  return (
    <div className={styles.tagFilters}>
      <button
        type="button"
        className={cx(styles.tagChip, active.length === 0 && styles.tagChipActive)}
        onClick={onClear}
      >
        ALL
      </button>
      {TAGS.map((tag) => {
        const on = active.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            className={cx(styles.tagChip, on && styles.tagChipActive)}
            onClick={() => onToggle(tag)}
            style={on ? { borderColor: TAG_COLOR[tag], color: TAG_COLOR[tag] } : undefined}
          >
            {tag.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default TagFilters;
