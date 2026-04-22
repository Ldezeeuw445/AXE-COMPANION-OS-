import React from "react";
import styles from "../styles/heatmap.module.css";
import { formatMarketCap, formatPrice } from "../utils/format";
import { formatMetric } from "../utils/color";
import { Sparkline } from "./Sparkline";

export function Tooltip({ node, mode, timeframe, x, y, containerW }) {
  if (!node) return null;
  const t = node.raw;
  const pct = (t.changes && t.changes[timeframe]) ?? 0;
  const relVol = t.volume && t.avgVolume ? t.volume / t.avgVolume : 0;

  // clamp x so it doesn't spill out
  const width = 240;
  let left = x + 16;
  if (left + width > containerW) left = Math.max(0, x - width - 16);
  const top = y + 16;

  return (
    <div className={styles.tooltip} style={{ left, top, width }}>
      <div className={styles.tooltipHeader}>
        <span className={styles.tooltipSymbol}>{t.symbol}</span>
        <span
          className={styles.tooltipPct}
          data-direction={pct > 0 ? "up" : pct < 0 ? "down" : "flat"}
        >
          {pct > 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      </div>
      <div className={styles.tooltipName}>{t.name}</div>
      <div className={styles.tooltipSpark}>
        <Sparkline values={t.sparkline || []} width={width - 24} height={34} />
      </div>
      <div className={styles.tooltipGrid}>
        <div>
          <span>PRICE</span>
          <strong>${formatPrice(t.price)}</strong>
        </div>
        <div>
          <span>MKT CAP</span>
          <strong>{formatMarketCap(t.marketCap)}</strong>
        </div>
        <div>
          <span>SECTOR</span>
          <strong>{t.sector}</strong>
        </div>
        <div>
          <span>P/E</span>
          <strong>{t.peRatio ? t.peRatio.toFixed(1) : "—"}</strong>
        </div>
        <div>
          <span>REL VOL</span>
          <strong>{relVol ? relVol.toFixed(2) + "x" : "—"}</strong>
        </div>
        <div>
          <span>{timeframe}</span>
          <strong>{formatMetric("performance", pct)}</strong>
        </div>
      </div>
    </div>
  );
}

export default Tooltip;
