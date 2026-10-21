"use client";

import { useEffect, useState } from "react";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";
import { WatchlistPageScreen, type QuoteRow } from "@/components/watchlist/WatchlistPageScreen";
import { ChartCacheFallback } from "@/components/chart/ChartCacheFallback";
import { StaleAgeBadge } from "@/components/pwa/StaleAgeBadge";
import { ServiceWorkerUpdateBanner } from "@/components/pwa/ServiceWorkerUpdateBanner";
import { writeCachedChart, type ChartCacheWriteInput } from "@/lib/chart/clientChartCache";
import { accountFreshness } from "@/lib/pwa/staleAge";
import { useOnlineStatus } from "@/lib/pwa/useOnlineStatus";

const NOW = Date.now();

const QUOTE_ITEMS: QuoteRow[] = [
  {
    id: "xau",
    symbol: "XAUUSD",
    message: null,
    bid: 2640.12,
    ask: 2640.38,
    spread: 0.26,
    freshness: new Date(NOW - 3 * 60_000).toISOString(),
    runtimeState: "live",
  },
  {
    id: "eur",
    symbol: "EURUSD",
    message: null,
    bid: 1.0812,
    ask: 1.0814,
    spread: 0.0002,
    freshness: new Date(NOW - 8_000).toISOString(),
    runtimeState: "live",
  },
];

function probeCandles(): ChartCacheWriteInput["candles"] {
  const out: ChartCacheWriteInput["candles"] = [];
  let close = 2640;
  for (let i = 0; i < 48; i += 1) {
    const open = close;
    close = open + ((i % 5) - 2) * 0.4;
    const high = Math.max(open, close) + 0.6;
    const low = Math.min(open, close) - 0.5;
    out.push({
      time: new Date(NOW - (48 - i) * 3_600_000).toISOString(),
      open,
      high,
      low,
      close,
      tickVolume: 120,
    });
  }
  return out;
}

export function PwaProbeScreen() {
  const online = useOnlineStatus();
  const [chartReady, setChartReady] = useState(false);
  const accountAge = accountFreshness({
    lastSyncAt: new Date(NOW - 45 * 60_000).toISOString(),
    online,
  });

  useEffect(() => {
    writeCachedChart(
      {
        symbol: "XAUUSD",
        brokerSymbol: "XAUUSD",
        timeframeKey: "h1",
        candles: probeCandles(),
        lastPrice: 2641.2,
        source: "MetaApi MT5",
      },
      NOW - 2 * 60 * 60_000,
    );
    setChartReady(true);
  }, []);

  return (
    <div data-testid="pwa-probe" className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <ActiveSessionSeed
        accountId="probe-acct"
        accountLabel="Probe Live"
        accountType="live"
        symbol="XAUUSD"
        lastTab="markets"
      />

      <ServiceWorkerUpdateBanner className="relative rounded-xl" onReload={() => undefined} />

      <section className="rounded-2xl border border-white/[0.06] bg-black/20">
        <div className="h-[280px] overflow-hidden">
          <WatchlistPageScreen items={QUOTE_ITEMS} accountLabel="Probe Live" />
        </div>
      </section>

      <section
        data-testid="pwa-probe-account"
        className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Account figures
          </p>
          <StaleAgeBadge freshness={accountAge} always testId="pwa-probe-account-stale" />
        </div>
        <div className="mt-2 flex gap-6" data-testid="account-figures">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/25">Balance</p>
            <p className="font-mono text-[13px] font-semibold tabular-nums text-white/80">10,400.00</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/25">Equity</p>
            <p className="font-mono text-[13px] font-semibold tabular-nums text-white/80">10,390.00</p>
          </div>
        </div>
      </section>

      <section
        data-testid="pwa-probe-candles"
        className="h-[280px] overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20"
      >
        {chartReady ? <ChartCacheFallback symbol="XAUUSD" tf="h1" /> : null}
      </section>
    </div>
  );
}
