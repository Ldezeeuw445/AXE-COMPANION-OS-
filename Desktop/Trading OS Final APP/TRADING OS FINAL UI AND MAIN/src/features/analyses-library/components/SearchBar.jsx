import React from "react";
import styles from "../styles/analyses.module.css";

export function SearchBar({ value, onChange, count }) {
  return (
    <div className={styles.searchBar}>
      <span className={styles.searchIcon}>⌕</span>
      <input
        type="text"
        className={styles.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search analyses, symbols, tags..."
      />
      <span className={styles.searchCount}>{count} results</span>
    </div>
  );
}

export default SearchBar;
