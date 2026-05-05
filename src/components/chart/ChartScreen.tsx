"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Eraser,
  Info,
  Landmark,
  MessageSquare,
  Save,
  Sparkles,
  Spline,
  Triangle,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { formatBrokerPrice, priceDigitsForSymbol } from "@/lib/broker/symbolFormat";
import type { ChartOverlayRow, ChartPageData } from "@/lib/broker/loadChartPageData";
import { ChartCanvas, type ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import {
  useLiveChart,
  type LivePosition,
  type LiveTransport,
  type LiveUiStatus,
} from "@/components/chart/useLiveChart";
import { usePageVisible } from "@/components/chart/usePageVisible";
import { CHART_THEME } from "@/components/chart/chartTheme";
import {
  AxeContextToolbar,
  type AxeToolbarSection,
} from "@/components/axe/AxeContextToolbar";
import {
  appendAnnotation,
  loadAnnotations,
  saveAnnotations,
} from "@/components/chart/annotations/store";
import type {
  AnnotationPoint,
  ChartAnnotation,
} from "@/components/chart/annotations/types";
import { ChartExecutionBridge } from "@/components/chart/ChartExecutionBridge";

const TICK_REACT_THROTTLE_MS = 150;
const SNAPSHOT_INTERVAL_MS = 30_000;

type Props = {
  data: ChartPageData;
};

type DrawingMode = "fib_retracement" | "trendline" | null;

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

function buildHref(account: string | null, symbol: string, tf: string): string {
  const params = new URLSearchParams();
  if (account) params.set("account", account);
  params.set("symbol", symbol);
  params.set("tf", tf);
  return `/chart?${params.toString()}`;
}

function formatBrokerTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function elapsedSince(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const diff = Math.max(0, Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.round(diff)}s open`;
  if (diff < 3600) return `${Math.round(diff / 60)}m open`;
  if (diff < 86_400) return `${Math.round(diff / 3600)}h open`;
  return `${Math.round(diff / 86_400)}d open`;
}

function newAnnotationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusPillCopy(
  live: LiveUiStatus,
  transport: LiveTransport,
  providerStatus: string | null,
  hasCandles: boolean,
): { label: string; className: string; dot: string } {
  if (providerStatus === "failed") {
    return {
      label: "Failed",
      className: "border-rose-500/30 bg-rose-500/12 text-rose-200/95",
      dot: "bg-rose-400/85",
    };
  }
  if (providerStatus === "provider_not_configured") {
    return {
      label: "Not configured",
      className: "border-amber-500/30 bg-amber-500/12 text-amber-200/95",
      dot: "bg-amber-300/85",
    };
  }
  if (live === "live_stream") {
    return {
      label: transport === "ws" ? "Live stream" : "Live",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200/95",
      dot: "bg-emerald-300 animate-pulse",
    };
  }
  if (live === "delayed_polling") {
    return {
      label: transport === "sse" ? "Delayed polling" : "Delayed",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95",
      dot: "bg-amber-300/85",
    };
  }
  if (live === "reconnecting") {
    return {
      label: "Reconnecting",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95",
      dot: "bg-amber-300/85 animate-pulse",
    };
  }
  if (live === "offline") {
    return {
      label: "Offline",
      className: "border-white/12 bg-white/[0.04] text-tos-muted",
      dot: "bg-white/30",
    };
  }
  if (live === "connecting") {
    return {
      label: "Connecting",
      className: "border-cyan-400/25 bg-cyan-400/8 text-cyan-200/90",
      dot: "bg-cyan-300/80 animate-pulse",
    };
  }
  if (hasCandles) {
    return {
      label: "Connected",
      className: "border-cyan-400/25 bg-cyan-400/8 text-cyan-200/95",
      dot: "bg-cyan-300/80",
    };
  }
  return {
    label: "Idle",
    className: "border-white/12 bg-white/[0.04] text-tos-muted",
    dot: "bg-white/30",
  };
}

function failureCardCopy(failure: ChartPageData["failure"]) {
  switch (failure) {
    case "account_not_connected":
      return {
        title: "Connect MT5 account to unlock broker chart",
        body:
          "AXE Companion uses your MetaApi-connected MT5 account as the only chart source. No external feed.",
      };
    case "broker_symbol_not_found":
      return {
        title: "Broker symbol not found on this account",
        body:
          "Different brokers use suffixes like XAUUSDm or XAUUSD.r. Try another suffix from your account, or pick a symbol from your open positions.",
      };
    case "candles_unavailable":
      return {
        title: "MT5 market data not available yet",
        body:
          "MetaApi could not return candles for this broker symbol or timeframe. Try Sync, change timeframe, or check the broker symbol.",
      };
    case "timeframe_unavailable":
      return {
        title: "Timeframe not available",
        body: "This broker symbol does not expose this timeframe. Try H1 or D1.",
      };
    case "live_stream_unavailable":
      return {
        title: "Live stream unavailable",
        body: "REST data still works. Live updates will resume when the stream reconnects.",
      };
    case "market_data_unavailable":
      return {
        title: "Chart connection failed",
        body: "MetaApi market data did not respond. Try again or check Accounts → Sync.",
      };
    case "provider_not_configured":
      return {
        title: "Chart not configured for this deployment",
        body: "MetaApi is not configured on the server. Connect a token to enable broker data.",
      };
    case "ok":
    default:
      return null;
  }
}

export function ChartScreen({ data }: Props) {
  const router = useRouter();
  const tfLabel = CHART_TF_OPTIONS.find((t) => t.key === data.timeframeKey)?.label ?? data.timeframeKey.toUpperCase();
  const accountId = data.account?.brokerAccountId ?? null;

  const [livePrice, setLivePrice] = useState<number | null>(data.lastPrice);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<ChartOverlayRow[]>(data.positionsOnSymbol);
  const [livePositionsCount, setLivePositionsCount] = useState<number>(data.totalPositions);
  const canvasRef = useRef<ChartCanvasHandle>(null);
  const lastReactPriceAt = useRef<number>(0);
  const lastBidRef = useRef<number | null>(null);
  const lastAskRef = useRef<number | null>(null);
  const dataDetailsRef = useRef<HTMLDetailsElement | null>(null);

  const isVisible = usePageVisible();
  const liveEnabled = data.failure === "ok" && Boolean(accountId) && isVisible;

  // Annotations
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const drawingPointsRef = useRef<AnnotationPoint[]>([]);
  const [drawingHint, setDrawingHint] = useState<string | null>(null);
  const [executionBridgeOpen, setExecutionBridgeOpen] = useState<boolean>(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);

  // Load saved annotations when symbol/tf changes
  useEffect(() => {
    queueMicrotask(() => {
      setAnnotations(loadAnnotations(data.symbol, data.timeframeKey));
      setDrawingMode(null);
      drawingPointsRef.current = [];
      setDrawingHint(null);
    });
  }, [data.symbol, data.timeframeKey]);

  const onTick = useCallback(
    ({ mid, bid, ask, time }: { mid: number | null; bid: number | null; ask: number | null; time: string | null }) => {
      if (mid == null || !Number.isFinite(mid)) return;
      lastBidRef.current = bid;
      lastAskRef.current = ask;
      canvasRef.current?.applyTick(mid);
      const now = Date.now();
      if (now - lastReactPriceAt.current >= TICK_REACT_THROTTLE_MS) {
        lastReactPriceAt.current = now;
        setLivePrice(mid);
        setLastTickAt(time ?? new Date().toISOString());
      }
    },
    [],
  );

  const onCandleUpdate = useCallback(
    (candle: { time: string; open: number; high: number; low: number; close: number }) => {
      canvasRef.current?.updateLastCandle(candle);
      if (Number.isFinite(candle.close)) setLivePrice(candle.close);
    },
    [],
  );

  const onPositions = useCallback(({ total, onSymbol }: { total: number; onSymbol: LivePosition[] }) => {
    setLivePositionsCount(total);
    const next: ChartOverlayRow[] = onSymbol.map((p) => ({
      id: p.id,
      side: p.side,
      volume: p.volume,
      entryPrice: p.entryPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      profit: p.profit,
      openTime: p.openTime,
      currentPrice: p.currentPrice,
    }));
    setOverlays(next);
  }, []);

  const { status: liveStatus, transport: liveTransport } = useLiveChart({
    enabled: liveEnabled,
    accountId,
    displaySymbol: data.symbol,
    brokerSymbol: data.brokerSymbol,
    timeframeKey: data.timeframeKey,
    onTick,
    onCandleUpdate,
    onPositions,
  });

  // Periodic audit snapshot — best-effort, fails silently if migration not applied.
  useEffect(() => {
    if (!liveEnabled || liveStatus !== "live_stream" || !accountId) return;
    const post = () => {
      void fetch("/api/chart/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accountId,
          displaySymbol: data.symbol,
          brokerSymbol: data.brokerSymbol,
          timeframe: data.timeframeKey,
          lastPrice: livePrice,
          lastBid: lastBidRef.current,
          lastAsk: lastAskRef.current,
          lastTickAt,
          lastCandleAt: data.lastCandleTime,
          openPositionsCount: livePositionsCount,
          openPositions: overlays,
          status: liveStatus,
        }),
      }).catch(() => undefined);
    };
    const t = setInterval(post, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [
    liveEnabled,
    liveStatus,
    accountId,
    data.symbol,
    data.brokerSymbol,
    data.timeframeKey,
    livePrice,
    lastTickAt,
    data.lastCandleTime,
    livePositionsCount,
    overlays,
  ]);

  // Reset live state when navigation changes the underlying data.
  const lastResetKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${data.account?.brokerAccountId ?? "_"}|${data.brokerSymbol}|${data.timeframeKey}`;
    if (lastResetKeyRef.current === key) return;
    lastResetKeyRef.current = key;
    queueMicrotask(() => {
      setLivePrice(data.lastPrice);
      setOverlays(data.positionsOnSymbol);
      setLivePositionsCount(data.totalPositions);
      setLastTickAt(null);
    });
  }, [
    data.account?.brokerAccountId,
    data.brokerSymbol,
    data.timeframeKey,
    data.lastPrice,
    data.positionsOnSymbol,
    data.totalPositions,
  ]);

  const statusPill = statusPillCopy(liveStatus, liveTransport, data.providerStatus, data.candles.length > 0);

  const goSymbol = useCallback(
    (sym: string) => {
      router.push(buildHref(accountId, sym, data.timeframeKey));
    },
    [router, accountId, data.timeframeKey],
  );
  const goTf = useCallback(
    (key: string) => {
      router.push(buildHref(accountId, data.symbol, key));
    },
    [router, accountId, data.symbol],
  );
  const goAccount = useCallback(
    (id: string) => {
      router.push(buildHref(id, data.symbol, data.timeframeKey));
    },
    [router, data.symbol, data.timeframeKey],
  );

  const lastPriceText = useMemo(
    () => formatBrokerPrice(data.brokerSymbol, livePrice),
    [data.brokerSymbol, livePrice],
  );
  const failureCopy = failureCardCopy(data.failure);
  const accountLabel = data.account?.label ?? null;

  const liveSummary =
    livePositionsCount === 0
      ? null
      : `${livePositionsCount} open${livePositionsCount === 1 ? "" : "s"} · ${overlays.length} on ${data.symbol}`;

  // Drawing tools ─ tap-to-place workflow
  const startDrawing = useCallback((mode: Exclude<DrawingMode, null>) => {
    drawingPointsRef.current = [];
    setDrawingMode(mode);
    setDrawingHint(
      mode === "fib_retracement"
        ? "Tap the swing high, then the swing low"
        : "Tap the first anchor, then the second",
    );
  }, []);

  const cancelDrawing = useCallback(() => {
    drawingPointsRef.current = [];
    setDrawingMode(null);
    setDrawingHint(null);
  }, []);

  const handlePointClick = useCallback(
    (pt: AnnotationPoint) => {
      if (!drawingMode) return;
      const next = [...drawingPointsRef.current, pt];
      drawingPointsRef.current = next;
      if (next.length >= 2) {
        const annotation: ChartAnnotation = {
          id: newAnnotationId(),
          symbol: data.symbol,
          timeframe: data.timeframeKey,
          type: drawingMode,
          points: next.slice(-2),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const list = appendAnnotation(data.symbol, data.timeframeKey, annotation);
        setAnnotations(list);
        drawingPointsRef.current = [];
        setDrawingMode(null);
        setDrawingHint(null);
      } else {
        setDrawingHint(
          drawingMode === "fib_retracement"
            ? "Now tap the swing low to complete Fibonacci"
            : "Now tap the second anchor to complete the trendline",
        );
      }
    },
    [drawingMode, data.symbol, data.timeframeKey],
  );

  const clearAllAnnotations = useCallback(() => {
    saveAnnotations(data.symbol, data.timeframeKey, []);
    setAnnotations([]);
  }, [data.symbol, data.timeframeKey]);

  const removeLastAnnotation = useCallback(() => {
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      saveAnnotations(data.symbol, data.timeframeKey, next);
      return next;
    });
  }, [data.symbol, data.timeframeKey]);

  const saveSnapshotToVault = useCallback(async () => {
    setSnapshotMessage("Saving snapshot…");
    try {
      const res = await fetch("/api/chart/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accountId,
          displaySymbol: data.symbol,
          brokerSymbol: data.brokerSymbol,
          timeframe: data.timeframeKey,
          lastPrice: livePrice,
          lastBid: lastBidRef.current,
          lastAsk: lastAskRef.current,
          lastTickAt,
          lastCandleAt: data.lastCandleTime,
          openPositionsCount: livePositionsCount,
          openPositions: overlays,
          status: liveStatus,
        }),
      });
      if (res.ok) {
        setSnapshotMessage("Saved to audit snapshot.");
      } else {
        setSnapshotMessage("Could not save snapshot (run migration?).");
      }
    } catch {
      setSnapshotMessage("Snapshot failed.");
    } finally {
      setTimeout(() => setSnapshotMessage(null), 4_000);
    }
  }, [accountId, data, livePrice, lastTickAt, livePositionsCount, overlays, liveStatus]);

  const focusDataDetails = useCallback(() => {
    const el = dataDetailsRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const toolbarSections: AxeToolbarSection[] = useMemo(() => {
    const drawDisabled = data.failure !== "ok";
    return [
      {
        id: "ask-axe",
        title: "Ask AXE",
        items: [
          {
            id: "ask-chart",
            label: "Ask AXE about this chart",
            description: `${data.symbol} · ${tfLabel} structure & key levels`,
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            href: chatQ(
              `[AXE · chart ${data.symbol} ${tfLabel}]\nExplain structure, key levels and what matters next on my broker chart. Reference my open ${data.symbol} positions if any.`,
            ),
          },
          {
            id: "risk-check",
            label: "Risk check open positions",
            description: "RR, SL/TP distance, what needs attention now",
            icon: <ClipboardList className="h-3.5 w-3.5" />,
            href: chatQ(
              `[AXE · risk]\nRisk-check my open MT5 positions${overlays.length ? ` on ${data.symbol}` : ""} — distance to SL/TP, RR and what needs attention.`,
            ),
          },
          {
            id: "trade-plan",
            label: "Prepare trade plan (intent)",
            description: "Bias, entries, invalidation — execution disabled",
            icon: <Sparkles className="h-3.5 w-3.5" />,
            href: chatQ(
              `[AXE · plan]\nDraft a trade plan (intent only — execution disabled) for ${data.symbol} on ${tfLabel}: bias, entry zone, invalidation, take-profit, conviction and what evidence I want before pulling the trigger.`,
            ),
          },
        ],
      },
      {
        id: "drawing",
        title: "Drawing tools",
        items: [
          {
            id: "fib",
            label: "Add Fibonacci",
            description: "Tap swing high → swing low",
            icon: <Spline className="h-3.5 w-3.5" />,
            disabled: drawDisabled,
            onSelect: () => startDrawing("fib_retracement"),
          },
          {
            id: "trendline",
            label: "Add trendline",
            description: "Two-tap anchored line",
            icon: <Triangle className="h-3.5 w-3.5" />,
            disabled: drawDisabled,
            onSelect: () => startDrawing("trendline"),
          },
          {
            id: "remove-last",
            label: "Remove last drawing",
            icon: <Eraser className="h-3.5 w-3.5" />,
            disabled: annotations.length === 0,
            onSelect: removeLastAnnotation,
          },
          {
            id: "clear",
            label: "Clear all drawings",
            icon: <Eraser className="h-3.5 w-3.5" />,
            disabled: annotations.length === 0,
            onSelect: clearAllAnnotations,
          },
        ],
      },
      {
        id: "actions",
        title: "Actions",
        items: [
          {
            id: "alert",
            label: "Set price alert",
            icon: <Bell className="h-3.5 w-3.5" />,
            href: `/alerts?symbol=${encodeURIComponent(data.brokerSymbol)}`,
          },
          {
            id: "journal",
            label: "Journal this setup",
            icon: <BookOpen className="h-3.5 w-3.5" />,
            href: "/journal",
          },
          {
            id: "snapshot",
            label: "Save chart snapshot",
            description: "Audit table snapshot for later review",
            icon: <Save className="h-3.5 w-3.5" />,
            onSelect: () => void saveSnapshotToVault(),
          },
          {
            id: "exec-bridge",
            label: executionBridgeOpen ? "Hide execution bridge" : "Show execution bridge",
            description: "Review-only by default. Execution stays off.",
            icon: <Activity className="h-3.5 w-3.5" />,
            hint: executionBridgeOpen ? "open" : "off",
            onSelect: () => setExecutionBridgeOpen((v) => !v),
          },
        ],
      },
      {
        id: "context",
        title: "Context",
        items: [
          {
            id: "open-account",
            label: accountLabel ? `Open ${accountLabel}` : "Open active account",
            icon: <Landmark className="h-3.5 w-3.5" />,
            href: "/accounts",
          },
          {
            id: "diagnostics",
            label: "Open data details",
            icon: <Info className="h-3.5 w-3.5" />,
            onSelect: focusDataDetails,
          },
        ],
      },
    ];
  }, [
    data.symbol,
    data.brokerSymbol,
    tfLabel,
    overlays.length,
    annotations.length,
    accountLabel,
    executionBridgeOpen,
    data.failure,
    startDrawing,
    removeLastAnnotation,
    clearAllAnnotations,
    saveSnapshotToVault,
    focusDataDetails,
  ]);

  // Inject the LIVE pill (center) and AXE button (right) into the global mobile top bar.
  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    setCenter(
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusPill.className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${statusPill.dot}`} aria-hidden />
        {statusPill.label}
      </span>,
    );
    setRight(
      <AxeContextToolbar
        title="Chart"
        subtitle={`${data.symbol} · ${tfLabel}`}
        sections={toolbarSections}
      />,
    );
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [setCenter, setRight, statusPill.className, statusPill.dot, statusPill.label, data.symbol, tfLabel, toolbarSections]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Desktop-only inline top row — mobile uses the global top bar slots above */}
      <div className="hidden grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/[0.04] py-2 md:grid">
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-mono text-sm font-semibold uppercase tracking-wider text-tos-text">
            {data.symbol}
          </span>
          <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tos-muted">
            {tfLabel}
          </span>
        </div>
        <span
          className={`mx-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusPill.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusPill.dot}`} aria-hidden />
          {statusPill.label}
        </span>
        <div className="flex justify-end">
          <AxeContextToolbar
            title="Chart"
            subtitle={`${data.symbol} · ${tfLabel}`}
            sections={toolbarSections}
          />
        </div>
      </div>

      {/* Drawing mode hint */}
      {drawingHint ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-3 py-2 text-[11px] text-cyan-100/95">
          <span>
            Drawing: <span className="font-semibold">{drawingHint}</span>
          </span>
          <button
            type="button"
            onClick={cancelDrawing}
            className="rounded-lg border border-white/12 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-tos-muted hover:bg-white/[0.1]"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Chart frame — fills most of the viewport */}
      <div
        className="relative mt-2 w-full overflow-hidden rounded-2xl border border-white/[0.06]"
        style={{
          background: CHART_THEME.background,
          height: "min(calc(100dvh - 14rem), 720px)",
          minHeight: 320,
        }}
      >
        <ChartCanvas
          ref={canvasRef}
          candles={data.candles}
          overlays={overlays}
          symbol={data.brokerSymbol}
          annotations={annotations}
          drawingMode={drawingMode}
          onPointClick={handlePointClick}
        />

        {/* In-chart price overlay (top-left) */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[60%]">
          <p className="font-mono text-3xl font-bold tracking-tight text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)] sm:text-4xl">
            {lastPriceText}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/75">
            {tfLabel} close · MetaApi MT5
            {accountLabel ? ` · ${accountLabel}` : ""}
          </p>
          {liveSummary ? (
            <p className="mt-1.5 inline-block rounded-full border border-cyan-400/20 bg-black/55 px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-cyan-100/85 backdrop-blur">
              {liveSummary}
            </p>
          ) : null}
        </div>

        {/* Failure overlay sits on top of the chart frame so layout stays stable */}
        {failureCopy ? (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-b from-transparent via-[#04070C]/60 to-[#04070C]/95 p-4 sm:items-center">
            <GlassPanel className="w-full max-w-md p-4 sm:p-5" glow="warm">
              <p className="text-sm font-semibold text-tos-text">{failureCopy.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-tos-muted">{failureCopy.body}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {data.failure === "account_not_connected" || data.failure === "provider_not_configured" ? (
                  <Link
                    href="/accounts"
                    className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
                  >
                    Connect account
                  </Link>
                ) : (
                  <Link
                    href="/accounts"
                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
                  >
                    Sync account
                  </Link>
                )}
                {data.failure === "candles_unavailable" || data.failure === "broker_symbol_not_found" ? (
                  <button
                    type="button"
                    onClick={() => goTf("h1")}
                    className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-semibold text-tos-muted hover:bg-white/[0.08]"
                  >
                    Try H1
                  </button>
                ) : null}
                <Link
                  href={chatQ(`Help me debug my MT5 chart on ${data.symbol} ${tfLabel}. Failure: ${data.failure}.`)}
                  className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 font-semibold text-tos-muted hover:bg-white/[0.08]"
                >
                  Ask AXE
                </Link>
              </div>
            </GlassPanel>
          </div>
        ) : null}
      </div>

      {/* Compact selectors row under the chart */}
      <div className="-mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1">
        {CHART_TF_OPTIONS.map((t) => {
          const active = t.key === data.timeframeKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goTf(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-cyan-500/18 text-cyan-100/95 ring-1 ring-cyan-500/35"
                  : "bg-white/[0.03] text-tos-muted hover:bg-white/[0.07]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <span className="mx-2 hidden h-4 w-px bg-white/[0.06] sm:inline-block" aria-hidden />
        <select
          value={data.symbol}
          onChange={(e) => goSymbol(e.target.value)}
          className="shrink-0 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-tos-text outline-none focus:border-cyan-500/40"
          aria-label="Symbol"
        >
          {data.symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {data.accountChoices.length > 1 ? (
          <select
            value={accountId ?? ""}
            onChange={(e) => goAccount(e.target.value)}
            className="shrink-0 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] tracking-wider text-tos-text outline-none focus:border-cyan-500/40"
            aria-label="Account"
          >
            {data.accountChoices.map((a) => (
              <option key={a.brokerAccountId} value={a.brokerAccountId}>
                {a.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {snapshotMessage ? (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-tos-muted">
          {snapshotMessage}
        </p>
      ) : null}

      {/* Position summary */}
      {overlays.length > 0 ? (
        <GlassPanel className="mt-3 !p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            Open on {data.symbol}
          </p>
          <ul className="space-y-2">
            {overlays.map((o) => {
              const distSL = o.stopLoss != null && o.currentPrice != null ? Math.abs(o.currentPrice - o.stopLoss) : null;
              const distTP = o.takeProfit != null && o.currentPrice != null ? Math.abs(o.takeProfit - o.currentPrice) : null;
              const rr = (() => {
                if (o.entryPrice == null || o.stopLoss == null || o.takeProfit == null) return null;
                const risk = Math.abs(o.entryPrice - o.stopLoss);
                if (risk <= 0) return null;
                const reward = Math.abs(o.takeProfit - o.entryPrice);
                return reward / risk;
              })();
              const profit = o.profit ?? 0;
              const profitColor =
                profit > 0 ? CHART_THEME.positiveText : profit < 0 ? CHART_THEME.negativeText : CHART_THEME.neutralText;
              const digits = priceDigitsForSymbol(data.brokerSymbol);
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-tos-text">
                    {o.side === "buy" ? "Long" : o.side === "sell" ? "Short" : o.side}
                  </span>
                  <span className="font-mono text-xs text-tos-muted">{o.volume}</span>
                  <span className="font-mono text-xs text-tos-muted">
                    Entry {o.entryPrice != null ? o.entryPrice.toFixed(digits) : "—"}
                  </span>
                  <span className="font-mono text-xs text-tos-muted">
                    SL {o.stopLoss != null ? o.stopLoss.toFixed(digits) : "—"}
                    {distSL != null ? ` (${distSL.toFixed(digits)})` : ""}
                  </span>
                  <span className="font-mono text-xs text-tos-muted">
                    TP {o.takeProfit != null ? o.takeProfit.toFixed(digits) : "—"}
                    {distTP != null ? ` (${distTP.toFixed(digits)})` : ""}
                  </span>
                  {rr != null ? <span className="font-mono text-[11px] text-tos-dim">RR {rr.toFixed(2)}</span> : null}
                  {o.openTime ? (
                    <span className="font-mono text-[11px] text-tos-dim">{elapsedSince(o.openTime)}</span>
                  ) : null}
                  <span className="ml-auto font-mono text-sm" style={{ color: profitColor }}>
                    {profit >= 0 ? "+" : ""}
                    {profit.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        </GlassPanel>
      ) : null}

      {/* Execution bridge — review-only, default off */}
      {executionBridgeOpen ? (
        <ChartExecutionBridge
          symbol={data.symbol}
          brokerSymbol={data.brokerSymbol}
          timeframeLabel={tfLabel}
          lastPrice={livePrice}
          digits={priceDigitsForSymbol(data.brokerSymbol)}
          onClose={() => setExecutionBridgeOpen(false)}
        />
      ) : null}

      {/* Quick actions (compact) */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Link
          href={chatQ(
            `[AXE · chart ${data.symbol} ${tfLabel}]\nExplain structure, key levels and what matters next on my broker chart. Reference my open ${data.symbol} positions if any.`,
          )}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-tos-muted transition-colors hover:border-cyan-500/30 hover:text-tos-text"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-cyan-400/85" />
          Ask AXE about this chart
        </Link>
        <Link
          href={chatQ(
            `[AXE · risk]\nRisk-check my open MT5 positions${overlays.length ? ` on ${data.symbol}` : ""} — distance to SL/TP, RR and what needs attention.`,
          )}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-tos-muted transition-colors hover:border-cyan-500/30 hover:text-tos-text"
        >
          <ClipboardList className="h-4 w-4 shrink-0 text-cyan-400/85" />
          Risk check
        </Link>
        <Link
          href={`/alerts?symbol=${encodeURIComponent(data.brokerSymbol)}`}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-tos-muted transition-colors hover:border-cyan-500/30 hover:text-tos-text"
        >
          <Bell className="h-4 w-4 shrink-0 text-cyan-400/85" />
          Set alert
        </Link>
        <Link
          href="/journal"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-tos-muted transition-colors hover:border-cyan-500/30 hover:text-tos-text"
        >
          <BookOpen className="h-4 w-4 shrink-0 text-cyan-400/85" />
          Journal
        </Link>
        <Link
          href={chatQ(
            `[AXE · plan]\nDraft a trade plan (intent only — execution disabled) for ${data.symbol} on ${tfLabel}: bias, entry zone, invalidation, take-profit, conviction and what evidence I want before pulling the trigger.`,
          )}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-tos-muted transition-colors hover:border-cyan-500/30 hover:text-tos-text"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-cyan-400/85" />
          Trade plan
        </Link>
        <button
          type="button"
          onClick={() => setExecutionBridgeOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[11px] font-medium transition-colors ${
            executionBridgeOpen
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100/95"
              : "border-white/10 bg-white/[0.03] text-tos-muted hover:border-cyan-500/30 hover:text-tos-text"
          }`}
        >
          <Activity className="h-4 w-4 shrink-0 text-cyan-400/85" />
          {executionBridgeOpen ? "Hide bridge" : "Execution bridge"}
        </button>
      </div>

      {/* Data details */}
      <details
        ref={dataDetailsRef}
        className="group mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25"
        open={data.failure !== "ok"}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tos-muted [&::-webkit-details-marker]:hidden">
          Data details
          <ChevronDown className="h-4 w-4 shrink-0 text-tos-dim transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-white/[0.05] px-4 py-3 text-[11px] sm:grid-cols-2">
          <div>
            <dt className="text-tos-dim">Account</dt>
            <dd className="text-tos-text">{accountLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Provider</dt>
            <dd className="text-tos-text">{data.source}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Broker server</dt>
            <dd className="text-tos-text">{data.account?.mt5Server ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Display symbol</dt>
            <dd className="font-mono text-tos-text">{data.symbol}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Broker symbol</dt>
            <dd className="font-mono text-tos-text">{data.brokerSymbol}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Timeframe</dt>
            <dd className="font-mono text-tos-text">
              {tfLabel} ({data.metaApiTimeframe})
            </dd>
          </div>
          <div>
            <dt className="text-tos-dim">Candles loaded</dt>
            <dd className="font-mono text-tos-text">{data.candles.length}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Last candle</dt>
            <dd className="text-tos-text">{formatBrokerTime(data.lastCandleTime)}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Last live tick</dt>
            <dd className="text-tos-text">{lastTickAt ? formatBrokerTime(lastTickAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Open positions</dt>
            <dd className="font-mono text-tos-text">{livePositionsCount}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Live stream</dt>
            <dd className="text-tos-text">
              {statusPill.label}
              {liveTransport !== "off" ? ` · ${liveTransport.toUpperCase()}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-tos-dim">Annotations</dt>
            <dd className="font-mono text-tos-text">{annotations.length}</dd>
          </div>
          <div>
            <dt className="text-tos-dim">Attempted symbols</dt>
            <dd className="font-mono text-tos-text">{data.attemptedSymbols.join(", ") || "—"}</dd>
          </div>
          {data.dataError ? (
            <div className="sm:col-span-2">
              <dt className="text-tos-dim">Reason</dt>
              <dd className="text-tos-text">{data.dataError}</dd>
            </div>
          ) : null}
        </dl>
      </details>

      <p className="px-1 pb-2 pt-2 text-[10px] leading-relaxed text-tos-dim">
        Same feed as your connected account. No external chart feed. Execution disabled by default.
      </p>
    </div>
  );
}
