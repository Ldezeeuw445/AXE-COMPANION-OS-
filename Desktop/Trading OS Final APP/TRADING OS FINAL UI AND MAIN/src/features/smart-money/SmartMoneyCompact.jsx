import React, { useMemo, useCallback } from "react";
import styles from "./styles/smart-money.module.css";
import { usePolling } from "./hooks/useAsync";
import { aggregate } from "./engine/aggregator";
import { SignalRow } from "./components/SignalRow";

/**
 * SmartMoneyCompact — small square panel, designed to sit next to a chart.
 *
 * Shows top N signals, optionally filtered to a single symbol (the one the
 * chart is showing) or its peers.
 *
 * Props:
 *   dataSource        — SmartMoneyDataSource
 *   refreshMs?        — poll interval, default 30_000
 *   limit?            — max rows, default 4
 *   filterSymbol?     — show only this ticker + related
 *   onSignalSelect?   — callback when a row is clicked
 *   config?           — AggregatorConfig overrides
 *   windowHours?      — lookback, default 48
 */
export function SmartMoneyCompact({
  dataSource,
  refreshMs = 30_000,
  limit = 4,
  filterSymbol,
  onSignalSelect,
  config,
  windowHours = 48,
}) {
  const fetcher = useCallback(
    (signal) => {
      const since = Date.now() - windowHours * 60 * 60 * 1000;
      return dataSource.listEvents(since, signal);
    },
    [dataSource, windowHours]
  );

  const { data: events, loading, error, refetch } = usePolling(
    fetcher,
    refreshMs,
    [dataSource, windowHours]
  );

  const signals = useMemo(() => {
    if (!events) return [];
    const aggregated = aggregate(events, config);
    if (filterSymbol) {
      const target = filterSymbol.toUpperCase();
      const exact = aggregated.filter((s) => s.symbol === target);
      const rest = aggregated.filter((s) => s.symbol !== target);
      return [...exact, ...rest].slice(0, limit);
    }
    return aggregated.slice(0, limit);
  }, [events, config, filterSymbol, limit]);

  return (
    <div className={styles.compact}>
      <div className={styles.compactHead}>
        <div className={styles.bannerTitleGroup}>
          <span className={styles.bannerDot} data-live={!error ? "true" : undefined} />
          <span className={styles.compactTitle}>
            {filterSymbol ? `SMART MONEY · ${filterSymbol.toUpperCase()}` : "SMART MONEY"}
          </span>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={refetch}
          disabled={loading}
        >
          {loading ? "..." : "↻"}
        </button>
      </div>
      <div className={styles.compactBody}>
        {error ? (
          <div className={styles.state}>Failed to load</div>
        ) : loading && !events ? (
          <div className={styles.state}>Loading...</div>
        ) : signals.length === 0 ? (
          <div className={styles.state}>No signals</div>
        ) : (
          signals.map((s) => (
            <SignalRow key={s.symbol} signal={s} onClick={onSignalSelect} />
          ))
        )}
      </div>
    </div>
  );
}

export default SmartMoneyCompact;
