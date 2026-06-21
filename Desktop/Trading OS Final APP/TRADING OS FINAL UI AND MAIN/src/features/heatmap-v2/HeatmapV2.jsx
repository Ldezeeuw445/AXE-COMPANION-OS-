import React, { useState, useMemo, useCallback } from "react";
import styles from "./styles/heatmap.module.css";
import { useAsync } from "./hooks/useAsync";
import { useSize } from "./hooks/useSize";
import { Toolbar } from "./components/Toolbar";
import { Legend } from "./components/Legend";
import { TreemapCanvas } from "./components/TreemapCanvas";

/**
 * HeatmapV2 — Finviz-style market cap weighted treemap.
 *
 * Props:
 *   dataSource  — HeatmapDataSource (see types.d.ts)
 *   defaultTimeframe?: Timeframe
 *   defaultMetric?: MetricMode
 *   onTickerClick?: (ticker) => void
 */
export function HeatmapV2({
  dataSource,
  defaultTimeframe = "1D",
  defaultMetric = "performance",
}) {
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [metric, setMetric] = useState(defaultMetric);
  const [ref, size] = useSize();

  const fetcher = useCallback(
    (signal) => dataSource.getSnapshot(signal),
    [dataSource]
  );
  const { data, loading, error, refetch } = useAsync(fetcher, [dataSource]);

  const tickers = useMemo(() => (data ? data.tickers : []), [data]);

  return (
    <div className={styles.root}>
      <Toolbar
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        metric={metric}
        onMetricChange={setMetric}
        asOf={data ? data.asOf : null}
        onRefresh={refetch}
        loading={loading}
      />
      <div className={styles.canvasWrap}>
        <div className={styles.canvasViewport} ref={ref}>
          {error ? (
            <div className={styles.state}>Failed to load: {String(error.message || error)}</div>
          ) : loading && !data ? (
            <div className={styles.state}>Loading heatmap...</div>
          ) : tickers.length === 0 ? (
            <div className={styles.state}>No tickers.</div>
          ) : (
            <TreemapCanvas
              tickers={tickers}
              size={size}
              timeframe={timeframe}
              metric={metric}
            />
          )}
        </div>
      </div>
      <Legend metric={metric} />
    </div>
  );
}

export default HeatmapV2;
