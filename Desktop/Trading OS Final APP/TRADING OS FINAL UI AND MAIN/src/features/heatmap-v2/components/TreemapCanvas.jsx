import React, { useMemo, useState } from "react";
import styles from "../styles/heatmap.module.css";
import { buildTreemap } from "../utils/treemap";
import { getMetricExtractor, getColorFn, formatMetric } from "../utils/color";
import { Tooltip } from "./Tooltip";

export function TreemapCanvas({ tickers, size, timeframe, metric }) {
  const [hover, setHover] = useState(null); // { node, x, y }

  const extractor = useMemo(
    () => getMetricExtractor(metric, timeframe),
    [metric, timeframe]
  );
  const colorFn = useMemo(() => getColorFn(metric), [metric]);

  const { sectors, nodes } = useMemo(() => {
    if (!size.w || !size.h) return { sectors: [], nodes: [] };
    return buildTreemap(
      tickers,
      { x: 0, y: 0, w: size.w, h: size.h },
      extractor,
      2,
      18
    );
  }, [tickers, size.w, size.h, extractor]);

  const handleMove = (node) => (e) => {
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    setHover({
      node,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleLeave = () => setHover(null);

  return (
    <div className={styles.canvas}>
      {sectors.map((s) => (
        <React.Fragment key={s.sector}>
          <div
            className={styles.sectorHeader}
            style={{
              left: s.x,
              top: s.y,
              width: s.w,
              height: 18,
            }}
          >
            <span className={styles.sectorName}>{s.sector.toUpperCase()}</span>
            <span className={styles.sectorCount}>{s.tickers.length}</span>
          </div>
        </React.Fragment>
      ))}

      {nodes.map((n) => {
        const area = n.w * n.h;
        const showSymbol = area > 900;
        const showMetric = area > 2400;
        const showSmallOnly = area > 300 && area <= 900;
        const fill = colorFn(n.metricValue);
        return (
          <div
            key={n.symbol}
            className={styles.cell}
            style={{
              left: n.x,
              top: n.y,
              width: n.w,
              height: n.h,
              backgroundColor: fill,
            }}
            onMouseMove={handleMove(n)}
            onMouseLeave={handleLeave}
          >
            {showSymbol ? (
              <>
                <span className={styles.cellSymbol}>{n.symbol}</span>
                {showMetric ? (
                  <span className={styles.cellMetric}>
                    {formatMetric(metric, n.metricValue)}
                  </span>
                ) : null}
              </>
            ) : showSmallOnly ? (
              <span className={styles.cellSymbolSmall}>{n.symbol}</span>
            ) : null}
          </div>
        );
      })}

      {hover ? (
        <Tooltip
          node={hover.node}
          mode={metric}
          timeframe={timeframe}
          x={hover.x}
          y={hover.y}
          containerW={size.w}
        />
      ) : null}
    </div>
  );
}

export default TreemapCanvas;
