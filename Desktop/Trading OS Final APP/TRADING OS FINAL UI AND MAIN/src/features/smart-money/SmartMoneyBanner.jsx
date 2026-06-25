import React, { useMemo, useCallback } from "react";
import styles from "./styles/smart-money.module.css";
import { usePolling } from "./hooks/useAsync";
import { aggregate } from "./engine/aggregator";
import { SignalCard } from "./components/SignalCard";

/**
 * SmartMoneyBanner — full-width thin banner for the top of Intel tab.
 *
 * Props:
 *   dataSource        — SmartMoneyDataSource
 *   refreshMs?        — poll interval, default 30_000 (30s)
 *   onSignalSelect?   — callback when a card is clicked
 *   activeSymbol?     — symbol of the currently focused ticker (highlights card)
 *   config?           — AggregatorConfig overrides
 *   windowHours?      — how far back to pull events, default 48
 */
export function SmartMoneyBanner({
  dataSource,
  refreshMs = 30_000,
  onSignalSelect,
  activeSymbol,
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

  const signals = useMemo(
    () => (events ? aggregate(events, config) : []),
    [events, config]
  );

  return (
    <div className={styles.banner}>
      <div className={styles.bannerHead}>
        <div className={styles.bannerTitleGroup}>
          <span className={styles.bannerDot} data-live={!error ? "true" : undefined} />
          <span className={styles.bannerTitle}>SMART MONEY SIGNALS</span>
          <span className={styles.bannerSub}>
            FUSED · {signals.length} TICKERS · {windowHours}H
          </span>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={refetch}
          disabled={loading}
          title="Refresh now"
        >
          {loading ? "..." : "↻"}
        </button>
      </div>
      <div className={styles.bannerScroller}>
        {error ? (
          <div className={styles.state}>Failed: {String(error.message || error)}</div>
        ) : loading && !events ? (
          <div className={styles.state}>Loading signals...</div>
        ) : signals.length === 0 ? (
          <div className={styles.state}>No signals in the last {windowHours}h.</div>
        ) : (
          signals.map((s) => (
            <SignalCard
              key={s.symbol}
              signal={s}
              active={activeSymbol && s.symbol === activeSymbol.toUpperCase()}
              onClick={onSignalSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default SmartMoneyBanner;
