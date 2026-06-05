"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RefObject } from "react";
import {
  Activity,
  ArrowUpDown,
  BarChart2,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Crosshair,
  GitBranch,
  Landmark,
  Layers,
  LineChart,
  MessageSquare,
  Maximize2,
  MoveHorizontal,
  Newspaper,
  Plus,
  Minus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Zap,
  Spline,
  Square,
  TrendingUp,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AxeBreatheLoader } from "@/components/ui/AxeBreatheLoader";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { formatBrokerPrice, priceDigitsForSymbol } from "@/lib/broker/symbolFormat";
import type { ChartOverlayRow, ChartPageData } from "@/lib/broker/loadChartPageData";
import { AxeChartActionBus } from "@/lib/axeChartActions/chartActionBus";
import {
  buildFibonacciActionFromCandles,
  buildTrendlineActionFromCandles,
} from "@/lib/axeChartActions/swingAnalysis";
import type {
  ChartActionCommand,
  ChartActionResult,
} from "@/lib/axeChartActions/chartActionTypes";
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
  removeAnnotation,
  saveAnnotations,
} from "@/components/chart/annotations/store";
import type {
  AnnotationPoint,
  ChartAnnotation,
} from "@/components/chart/annotations/types";
import { FibAnnotationLayer } from "@/components/chart/annotations/FibAnnotationLayer";
import { TrendlineAnnotationLayer } from "@/components/chart/annotations/TrendlineAnnotationLayer";
import { ChartIndicatorLayer } from "@/components/chart/indicators/ChartIndicatorLayer";
import { IndicatorPane } from "@/components/chart/indicators/IndicatorPane";
import { FutureProjectionCursor } from "@/components/chart/FutureProjectionCursor";
import { ChartOrderBookDrawer } from "@/components/chart/ChartOrderBookDrawer";
import { ChartNewsDrawer } from "@/components/chart/ChartNewsDrawer";
import {
  ChartOrderConfirm,
  type OrderConfirmInput,
  type OrderConfirmStatus,
} from "@/components/chart/ChartOrderConfirm";
import { useDemoPositions } from "@/components/chart/useDemoPositions";
import { useLiveTradingFlag } from "@/lib/liveTrading/liveTradingFlag";
import { useAlertEvaluator, type AlertFiredEvent } from "@/lib/alerts/useAlertEvaluator";

const TICK_REACT_THROTTLE_MS = 150;
const SNAPSHOT_INTERVAL_MS = 10_000;
const ROUTE_PENDING_VISUAL_BUDGET_MS = 12_000;

const CHART_SCALE_MODES = [
  { id: "near", label: "Close view" },
  { id: "mid", label: "Mid view" },
  { id: "far", label: "Wide view" },
] as const;

type Props = {
  data: ChartPageData;
  initialAction?: string;
  /** Server-loaded live-trading enabled flag (from user_workspace_preferences). */
  liveTradingEnabled?: boolean;
};

type DrawingMode = "fib_retracement" | "trendline" | null;
type OrderTicketType = "market" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
type PendingOrderTicketType = Exclude<OrderTicketType, "market">;

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

function sessionCopy(now = new Date()): string {
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sessions: string[] = [];
  if (utcHour >= 0 && utcHour < 8) sessions.push("Asia");
  if (utcHour >= 7 && utcHour < 16) sessions.push("London");
  if (utcHour >= 12 && utcHour < 21) sessions.push("NY");
  return sessions.length ? sessions.join(" + ") : "After-hours";
}

function marketSessionState(symbol: string, now = new Date()): { state: "open" | "after_hours" | "closed"; label: string; reason: string } {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC") || s.startsWith("ETH")) {
    return { state: "open", label: "Open", reason: "Crypto trades continuously." };
  }
  const day = now.getUTCDay();
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const weekendClosed = day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 22);
  if (weekendClosed) {
    return {
      state: "closed",
      label: "Closed",
      reason: "Broker session is closed; AXE freezes the last stable broker price until a fresh tick arrives.",
    };
  }
  if (["XAU", "XAG", "EUR", "GBP", "USD", "NAS", "US100", "SPX", "US500", "US30", "DOW"].some((prefix) => s.startsWith(prefix))) {
    return { state: "open", label: "Open", reason: "Broker session is open." };
  }
  return { state: "after_hours", label: "After-hours", reason: "No confirmed live market session for this symbol." };
}

function eventFreshEnough(iso: string | null | undefined, maxAgeMs = 30_000): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= maxAgeMs;
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
  hasFreshLiveData: boolean,
  sessionState: ReturnType<typeof marketSessionState>,
): { label: string; className: string; dot: string } {
  if (sessionState.state !== "open" && hasCandles && !hasFreshLiveData) {
    return {
      label: sessionState.label,
      className: "border-white/12 bg-white/[0.04] text-tos-muted",
      dot: "bg-white/30",
    };
  }
  if (providerStatus === "failed") {
    return {
      label: "Connection issue",
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
  if (providerStatus === "demo") {
    return {
      label: "Demo",
      className: "border-white/[0.10] bg-white/[0.05] text-white/90",
      dot: "bg-white/60",
    };
  }
  if ((live === "connected" || live === "live_stream") && hasFreshLiveData) {
    return {
      label: transport === "ws" ? "AXE Live" : "AXE Live",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200/95 shadow-[0_0_22px_-16px_rgba(52,211,153,0.9)]",
      dot: "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.75)]",
    };
  }
  if (live === "connected" || live === "live_stream") {
    return {
      label: hasCandles ? "Warming" : "Loading",
      className: "border-white/[0.08] bg-white/[0.04] text-white/90",
      dot: "bg-white/60",
    };
  }
  if (live === "stale") {
    return {
      label: "Data stale",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95",
      dot: "bg-amber-300/85",
    };
  }
  if (live === "delayed_polling") {
    return {
      label: transport === "sse" ? "SSE fallback" : "Delayed",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95",
      dot: "bg-amber-300/85",
    };
  }
  if (live === "reconnecting") {
    return {
      label: "Recovering",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-200/95",
      dot: "bg-amber-300/85 animate-pulse",
    };
  }
  if (live === "offline") {
    return {
      label: "Cached",
      className: "border-white/12 bg-white/[0.04] text-tos-muted",
      dot: "bg-white/30",
    };
  }
  if (live === "connecting") {
    return {
      label: "Connecting",
      className: "border-white/[0.08] bg-white/[0.04] text-white/80",
      dot: "bg-white/60 animate-pulse",
    };
  }
  if (hasCandles) {
    return {
      label: providerStatus === "stale" ? "Cached" : "Loaded",
      className: "border-white/12 bg-white/[0.04] text-tos-muted",
      dot: "bg-white/30",
    };
  }
  return {
    label: "Idle",
    className: "border-white/12 bg-white/[0.04] text-tos-muted",
    dot: "bg-white/30",
  };
}

function formatLiveAge(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function sameOverlayRows(a: ChartOverlayRow[], b: ChartOverlayRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.side !== right.side ||
      left.volume !== right.volume ||
      left.entryPrice !== right.entryPrice ||
      left.stopLoss !== right.stopLoss ||
      left.takeProfit !== right.takeProfit ||
      left.profit !== right.profit ||
      left.currentPrice !== right.currentPrice
    ) {
      return false;
    }
  }
  return true;
}

function failureCardCopy(failure: ChartPageData["failure"]) {
  switch (failure) {
    case "account_not_connected":
      return {
        title: "Connect MT5 account to unlock broker chart",
        body:
          "AXE Companion uses AXE MT5 Cloud as the broker chart source. No frontend feed keys are used.",
      };
    case "broker_symbol_not_found":
      return {
        title: "Symbol unsupported by active broker",
        body:
          "AXE could not map this clean symbol to a broker symbol on the active MT5 account. Sync the account, pick a supported symbol, or check Data details.",
      };
    case "candles_unavailable":
      return {
        title: "Broker candles unavailable",
        body:
          "The symbol mapping exists, but this account did not return candles for the selected timeframe. The market may be closed or the account needs Sync.",
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
    case "current_price_unavailable":
      return {
        title: "Current broker price unavailable",
        body: "Candles loaded, but MetaAPI did not return bid/ask for this broker symbol. AXE will not mark the feed live until a real quote arrives.",
      };
    case "metaapi_timeout":
      return {
        title: "MetaAPI market data timed out",
        body: "The broker terminal did not answer the candle/current-price request within AXE's render budget. Retry after Sync or redeploy.",
      };
    case "market_data_unavailable":
      return {
        title: "Broker market data unavailable",
        body: "AXE could not complete the broker market-data request for this symbol/timeframe.",
      };
    case "provider_not_configured":
      return {
        title: "Chart not configured for this deployment",
        body: "AXE MT5 Cloud is not configured on the server. Connect the server token to enable broker data.",
      };
    case "ok":
    default:
      return null;
  }
}

function draggablePlanDistance(candles: ChartPageData["candles"], fallbackPrice: number | null): number {
  const recent = candles.slice(-80);
  const highs = recent.map((c) => c.high).filter(Number.isFinite);
  const lows = recent.map((c) => c.low).filter(Number.isFinite);
  if (highs.length && lows.length) {
    const range = Math.max(...highs) - Math.min(...lows);
    if (Number.isFinite(range) && range > 0) return Math.max(range * 0.18, Math.abs(fallbackPrice ?? 1) * 0.001);
  }
  return Math.max(Math.abs(fallbackPrice ?? 1) * 0.0015, 1);
}

/**
 * MT5-style resizable pane wrapper. Renders a thin grab-handle along the top
 * edge of the pane; dragging it up grows the pane (and shrinks the chart
 * above), dragging it down shrinks it. Pointer capture keeps the drag glued
 * to the finger even when it leaves the handle area.
 */
function ResizablePane({
  height,
  onResize,
  minHeight,
  maxHeight,
  children,
  ariaLabel,
}: {
  height: number;
  onResize: (next: number) => void;
  minHeight: number;
  maxHeight: number;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  return (
    <div className="relative shrink-0" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        className="absolute inset-x-0 -top-1 z-30 flex h-3 cursor-ns-resize items-center justify-center"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { startY: event.clientY, startH: height };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const delta = drag.startY - event.clientY; // up = grow
          const next = Math.min(maxHeight, Math.max(minHeight, drag.startH + delta));
          onResize(next);
        }}
        onPointerUp={(event) => {
          if (!dragRef.current) return;
          dragRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            /* noop */
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <span className="h-0.5 w-10 rounded-full bg-white/20" aria-hidden />
      </div>
      {children}
    </div>
  );
}

function TradePlanLine({
  canvasRef,
  price,
  label,
  color,
  digits,
  onChange,
  dashed = false,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  price: number | null;
  label: string;
  color: string;
  digits: number;
  onChange: (price: number) => void;
  /** TP/SL render dashed; entry/limit renders solid — same convention MT5 uses. */
  dashed?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState(0);
  const [y, setY] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    const compute = () => {
      setY(price == null ? null : handle.priceToCoordinate(price));
      setAxisWidth(handle.getRightAxisWidth());
    };
    compute();
    return handle.subscribeViewport(compute);
  }, [canvasRef, price]);

  function updateFromPointer(clientY: number) {
    const host = hostRef.current;
    const handle = canvasRef.current;
    if (!host || !handle) return;
    const rect = host.getBoundingClientRect();
    const next = handle.coordinateToPrice(clientY - rect.top);
    if (next != null && Number.isFinite(next)) onChange(next);
  }

  if (price == null || y == null || size.w <= 0 || size.h <= 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  // Plot area ends where the right price axis starts.
  const plotRight = Math.max(0, size.w - Math.max(axisWidth, 56));
  const labelText = label.toUpperCase();
  const priceText = price.toFixed(digits);
  // Compact inline pill: "TP 4410.92" — label + price in one element.
  // ~5.5px per char at 10px font, plus padding.
  const pillText = `${labelText} ${priceText}`;
  const pillWidth = Math.max(60, pillText.length * 5.5 + 12);
  // Semi-transparent color fill per Luka's spec (25% opacity background).
  const rgbaFill = color.startsWith("#")
    ? `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},0.25)`
    : color.replace(/[\d.]+\)$/, "0.25)");

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-[24]"
      style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="absolute inset-0"
        style={{
          touchAction: dragging ? "none" : "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          event.preventDefault();
          event.stopPropagation();
          updateFromPointer(event.clientY);
        }}
        onPointerUp={(event) => {
          if (!dragging) return;
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {/* Thin line — 1px, 70% opacity. Dashed for TP/SL, solid for entry. */}
        <line
          x1={pillWidth + 6}
          x2={plotRight}
          y1={y}
          y2={y}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.7}
          strokeDasharray={dashed ? "4 8" : ""}
        />

        {/* Left: compact inline pill — "TP 4410.92" — draggable */}
        <g
          style={{ pointerEvents: "auto", cursor: "ns-resize" }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event.clientY);
          }}
        >
          {/* Generous invisible hit area for finger taps */}
          <rect x={0} y={y - 12} width={pillWidth + 12} height={24} fill="transparent" />
          <rect
            x={3}
            y={y - 7}
            width={pillWidth}
            height={14}
            rx={7}
            fill={rgbaFill}
          />
          <text
            x={3 + pillWidth / 2}
            y={y + 3}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={10}
            fontWeight={600}
            fill={color}
          >
            {pillText}
          </text>
        </g>
      </svg>
    </div>
  );
}

export function ChartScreen({ data, initialAction, liveTradingEnabled = false }: Props) {
  const router = useRouter();
  const tfLabel = CHART_TF_OPTIONS.find((t) => t.key === data.timeframeKey)?.label ?? data.timeframeKey.toUpperCase();
  const accountId = data.account?.brokerAccountId ?? null;
  const [isRoutePending, startRouteTransition] = useTransition();
  const [pendingTfKey, setPendingTfKey] = useState<string | null>(null);
  const [routeFallbackMessage, setRouteFallbackMessage] = useState<string | null>(null);
  const isTimeframePending =
    !routeFallbackMessage && (isRoutePending || (pendingTfKey != null && pendingTfKey !== data.timeframeKey));

  const [livePrice, setLivePrice] = useState<number | null>(data.lastPrice);
  const [liveBid, setLiveBid] = useState<number | null>(data.lastBid);
  const [liveAsk, setLiveAsk] = useState<number | null>(data.lastAsk);
  const [lastTickAt, setLastTickAt] = useState<string | null>(data.lastTickAt);
  const [overlays, setOverlays] = useState<ChartOverlayRow[]>(data.positionsOnSymbol);
  const [livePositionsCount, setLivePositionsCount] = useState<number>(data.totalPositions);
  const canvasRef = useRef<ChartCanvasHandle>(null);
  const lastReactPriceAt = useRef<number>(0);
  const isVisible = usePageVisible();
  const liveEnabled = data.failure === "ok" && data.source !== "AXE Demo" && Boolean(accountId) && isVisible;
  const sessionState = useMemo(() => marketSessionState(data.symbol), [data.symbol]);
  const closedCanonicalPrice = useMemo(() => data.lastPrice ?? data.candles.at(-1)?.close ?? null, [data.candles, data.lastPrice]);

  useEffect(() => {
    setPendingTfKey(null);
    setRouteFallbackMessage(null);
  }, [data.timeframeKey]);

  useEffect(() => {
    if (!pendingTfKey || pendingTfKey === data.timeframeKey) return;
    const timer = setTimeout(() => {
      setPendingTfKey(null);
      setRouteFallbackMessage("Still refreshing. Showing the last stable chart while AXE retries.");
    }, ROUTE_PENDING_VISUAL_BUDGET_MS);
    return () => clearTimeout(timer);
  }, [pendingTfKey, data.timeframeKey]);

  useEffect(() => {
    if (!routeFallbackMessage) return;
    const timer = setTimeout(() => setRouteFallbackMessage(null), 8_000);
    return () => clearTimeout(timer);
  }, [routeFallbackMessage]);

  useEffect(() => {
    for (const option of CHART_TF_OPTIONS) {
      if (option.key === data.timeframeKey) continue;
      router.prefetch(buildHref(accountId, data.symbol, option.key));
    }
  }, [accountId, data.symbol, data.timeframeKey, router]);

  // Annotations
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [annotationsLoadedKey, setAnnotationsLoadedKey] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const drawingPointsRef = useRef<AnnotationPoint[]>([]);
  const [drawingHint, setDrawingHint] = useState<string | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [scaleModeIndex, setScaleModeIndex] = useState(0);
  const [toolRailOpen, setToolRailOpen] = useState(false);
  const [indicatorRailOpen, setIndicatorRailOpen] = useState(false);
  const [activeToolFlags, setActiveToolFlags] = useState<Record<string, boolean>>({});
  const [indicatorToolFlags, setIndicatorToolFlags] = useState<Record<string, boolean>>({});
  // How many order blocks to render per direction. Default 1 bullish + 1
  // bearish; user can pick 2 or 3 each side via the small picker that
  // appears when OB is active. Persisted per device.
  const [orderBlockCount, setOrderBlockCount] = useState<1 | 2 | 3>(1);
  // Same idea for iFVGs. Default 1 each side; picker appears when iFVG
  // is active.
  const [inverseFvgCount, setInverseFvgCount] = useState<1 | 2 | 3>(1);
  // FVG count picker — mirrors OB / iFVG so the chart feels consistent.
  const [fvgCount, setFvgCount] = useState<1 | 2 | 3>(1);
  // Project count: how many of each indicator extend forward when the
  // future-projection cursor is on. 1 = only the latest each side.
  const [projectionCount, setProjectionCount] = useState<1 | 2 | 3>(1);
  // Auto-Fib source mode:
  //   "auto"   — most recent good trend leg on the active TF (default)
  //   "swing"  — latest SH ↔ SL pair from the swing-dot detection
  //   "pd"     — previous day's range, PDH ↔ PDL
  //   "sd"     — Supply / Demand: latest swing High ↔ latest swing Low,
  //              same anchors the S/D indicator uses, so band edges and
  //              fib 0% / 100% line up exactly. Geometrically identical
  //              to "swing" with offset 0; kept as a separate mode so
  //              the picker reflects intent ("anchor to S/D bands").
  type FibMode = "auto" | "swing" | "pd" | "sd";
  const [fibMode, setFibMode] = useState<FibMode>("auto");
  const [fibSwingOffset, setFibSwingOffset] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    try {
      const raw = Number(localStorage.getItem("axe.chart.obCount") ?? "");
      if (raw === 1 || raw === 2 || raw === 3) setOrderBlockCount(raw);
      const rawIfvg = Number(localStorage.getItem("axe.chart.ifvgCount") ?? "");
      if (rawIfvg === 1 || rawIfvg === 2 || rawIfvg === 3) setInverseFvgCount(rawIfvg);
      const rawFvg = Number(localStorage.getItem("axe.chart.fvgCount") ?? "");
      if (rawFvg === 1 || rawFvg === 2 || rawFvg === 3) setFvgCount(rawFvg);
      const rawProj = Number(localStorage.getItem("axe.chart.projectionCount") ?? "");
      if (rawProj === 1 || rawProj === 2 || rawProj === 3) setProjectionCount(rawProj);
      const rawIndicatorFlags = localStorage.getItem("axe.chart.indicatorFlags");
      if (rawIndicatorFlags) {
        const parsed = JSON.parse(rawIndicatorFlags) as Record<string, unknown>;
        setIndicatorToolFlags({
          volume: Boolean(parsed.volume),
          ma: Boolean(parsed.ma),
          macd: Boolean(parsed.macd),
          bollinger: Boolean(parsed.bollinger),
          rsi: Boolean(parsed.rsi),
          vwap: Boolean(parsed.vwap),
          poc: Boolean(parsed.poc),
        });
      } else {
        // Carry existing users forward: VOL / MA / RSI used to live in
        // the SMC rail under activeToolFlags. New installs default to
        // off, but if those old flags are in localStorage later this
        // leaves room for a non-breaking migration.
        setIndicatorToolFlags({});
      }
      const rawFib = localStorage.getItem("axe.chart.fibMode");
      if (rawFib === "auto" || rawFib === "swing" || rawFib === "pd" || rawFib === "sd") {
        setFibMode(rawFib);
      } else if (rawFib === "pd_band") {
        // Legacy mode replaced by the standalone S/D indicator. Migrate
        // the saved preference forward so the next launch picks the
        // closest equivalent (S/D fib mode) instead of resetting to
        // "auto".
        setFibMode("sd");
        try {
          localStorage.setItem("axe.chart.fibMode", "sd");
        } catch {
          /* ignore */
        }
      }
      const rawFibSwing = Number(localStorage.getItem("axe.chart.fibSwingOffset") ?? "");
      if (rawFibSwing === 0 || rawFibSwing === 1 || rawFibSwing === 2 || rawFibSwing === 3) {
        setFibSwingOffset(rawFibSwing);
      }
    } catch {
      /* localStorage may be blocked */
    }
  }, []);
  const updateOrderBlockCount = useCallback((next: 1 | 2 | 3) => {
    setOrderBlockCount(next);
    try {
      localStorage.setItem("axe.chart.obCount", String(next));
    } catch {
      /* ignore */
    }
  }, []);
  const updateInverseFvgCount = useCallback((next: 1 | 2 | 3) => {
    setInverseFvgCount(next);
    try {
      localStorage.setItem("axe.chart.ifvgCount", String(next));
    } catch {
      /* ignore */
    }
  }, []);
  const updateFvgCount = useCallback((next: 1 | 2 | 3) => {
    setFvgCount(next);
    try {
      localStorage.setItem("axe.chart.fvgCount", String(next));
    } catch {
      /* ignore */
    }
  }, []);
  const updateProjectionCount = useCallback((next: 1 | 2 | 3) => {
    setProjectionCount(next);
    try {
      localStorage.setItem("axe.chart.projectionCount", String(next));
    } catch {
      /* ignore */
    }
  }, []);
  // Persist + apply on change. The actual "rebuild the fib annotation
  // when the mode changes while a Fib is active" hook lives further down,
  // because it needs `executeActionByType` and `annotations` in scope.
  const updateFibMode = useCallback((next: FibMode) => {
    setFibMode(next);
    try {
      localStorage.setItem("axe.chart.fibMode", next);
    } catch {
      /* ignore */
    }
  }, []);
  const updateFibSwingOffset = useCallback((next: 0 | 1 | 2 | 3) => {
    setFibSwingOffset(next);
    try {
      localStorage.setItem("axe.chart.fibSwingOffset", String(next));
    } catch {
      /* ignore */
    }
  }, []);

  // Per-fib left/right extension toggles. The fib layer reads
  // `settings.extendLeft` / `settings.extendRight` and clamps the
  // rendered line accordingly; toggling here mutates EVERY fib on the
  // chart in lockstep so the user has one source of truth even if the
  // auto-fib has been re-built between toggles. Persisted via the
  // existing annotation save path (saveAnnotations hooks inside
  // updateAnnotation).
  const setFibExtendOnAll = useCallback(
    (axis: "extendLeft" | "extendRight", value: boolean) => {
      setAnnotations((prev) => {
        let mutated = false;
        const next = prev.map((ann) => {
          if (ann.type !== "fib_retracement") return ann;
          const settings = (ann.settings ?? {}) as Record<string, unknown>;
          if (Boolean(settings[axis]) === value) return ann;
          mutated = true;
          return {
            ...ann,
            settings: { ...settings, [axis]: value },
            updatedAt: new Date().toISOString(),
          };
        });
        if (!mutated) return prev;
        saveAnnotations(data.symbol, data.timeframeKey, next);
        return next;
      });
    },
    [data.symbol, data.timeframeKey],
  );

  // MT5-style resizable indicator panes. Defaults match what we previously
  // hard-coded; users can drag the divider on top of each pane to taste.
  const [paneHeights, setPaneHeights] = useState<{ volume: number; rsi: number; macd: number }>({
    volume: 108,
    rsi: 120,
    macd: 112,
  });

  // Hydrate pane heights from localStorage once on mount.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("axe.chart.paneHeight.volume") ?? "");
      const r = Number(localStorage.getItem("axe.chart.paneHeight.rsi") ?? "");
      const m = Number(localStorage.getItem("axe.chart.paneHeight.macd") ?? "");
      setPaneHeights((prev) => ({
        volume: Number.isFinite(v) && v >= 70 ? v : prev.volume,
        rsi: Number.isFinite(r) && r >= 70 ? r : prev.rsi,
        macd: Number.isFinite(m) && m >= 70 ? m : prev.macd,
      }));
    } catch {
      /* localStorage may be blocked — fall back to defaults */
    }
  }, []);

  const setPaneHeight = useCallback((mode: "volume" | "rsi" | "macd", next: number) => {
    setPaneHeights((prev) => ({ ...prev, [mode]: next }));
    try {
      localStorage.setItem(`axe.chart.paneHeight.${mode}`, String(Math.round(next)));
    } catch {
      /* ignore — best-effort persistence */
    }
  }, []);

  const hasFibAnnotation = useMemo(
    () => annotations.some((a) => a.type === "fib_retracement"),
    [annotations],
  );
  // Derived state for the extend ← / extend → pills: a pill is "on" if
  // EVERY fib annotation has that flag set. With a single auto-fib on
  // the chart (the common case) this collapses to that fib's state; if
  // the user has multiple fibs and mixed flags, the pill renders as
  // "off" and toggling it sets the flag on every fib at once.
  const allFibsExtendLeft = useMemo(() => {
    const fibs = annotations.filter((a) => a.type === "fib_retracement");
    if (fibs.length === 0) return false;
    return fibs.every((a) => Boolean((a.settings ?? {} as Record<string, unknown>).extendLeft));
  }, [annotations]);
  const allFibsExtendRight = useMemo(() => {
    const fibs = annotations.filter((a) => a.type === "fib_retracement");
    if (fibs.length === 0) return false;
    return fibs.every((a) => Boolean((a.settings ?? {} as Record<string, unknown>).extendRight));
  }, [annotations]);
  const hasTrendAnnotation = useMemo(
    () => annotations.some((a) => a.type === "trendline"),
    [annotations],
  );
  // MT5-style "future projection" cursor — shared between the indicator
  // layer (extends iFVG/OB/FVG forward) and the fib/trendline annotation
  // layers (project lines past the last candle). Stored in pixel space
  // for the active chart frame.
  const [futureProjectionX, setFutureProjectionX] = useState<number | null>(null);
  const [futureCursorEnabled, setFutureCursorEnabled] = useState(true);
  const futureCursorStorageKey = useMemo(
    () => `axe.chart.futureCursor.${data.symbol}.${data.timeframeKey}`,
    [data.symbol, data.timeframeKey],
  );

  // Slide-out drawers — order book and news/intel both open from the
  // chart's left edge so the chart frame itself never repaints when the
  // user toggles them. Only one drawer is shown at a time so the chart
  // remains usable behind the dim layer.
  const [orderBookOpen, setOrderBookOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const openOrderBook = useCallback(() => {
    setNewsOpen(false);
    setOrderBookOpen(true);
  }, []);
  const openNews = useCallback(() => {
    setOrderBookOpen(false);
    setNewsOpen(true);
  }, []);

  const [pendingOrderSide, setPendingOrderSide] = useState<"buy" | "sell">("buy");
  const [pendingOrderPrice, setPendingOrderPrice] = useState<number | null>(data.lastPrice);
  const [pendingStopLossPrice, setPendingStopLossPrice] = useState<number | null>(null);
  const [pendingTakeProfitPrice, setPendingTakeProfitPrice] = useState<number | null>(null);
  const [pendingOrderVisible, setPendingOrderVisible] = useState(false);
  const [tradeVolume, setTradeVolume] = useState("0.10");
  const [executionMode, setExecutionMode] = useState<"market" | "pending">("market");
  const [pendingOrderType, setPendingOrderType] = useState<OrderTicketType>("market");
  const [orderTypeMenuOpen, setOrderTypeMenuOpen] = useState(false);
  const [lotMenuOpen, setLotMenuOpen] = useState(false);
  const [deviationPoints, setDeviationPoints] = useState(10);
  const [oneClickVisible, setOneClickVisible] = useState(false);
  const [firedAlert, setFiredAlert] = useState<AlertFiredEvent | null>(null);

  // Order send wiring — demo fills locally, live opens a confirm modal that
  // POSTs to /api/mt5/order. `enabled` is server-persisted; armed window
  // is per-device. See liveTradingFlag.ts for the split-storage model.
  const liveTrading = useLiveTradingFlag(liveTradingEnabled);
  const isDemoAccount = data.account?.connectionMethod === "demo_paper";
  const demoBook = useDemoPositions(
    data.account?.brokerAccountId ?? null,
    data.symbol,
    livePrice,
  );
  const [orderConfirmInput, setOrderConfirmInput] = useState<OrderConfirmInput | null>(null);
  const [orderConfirmStatus, setOrderConfirmStatus] = useState<OrderConfirmStatus>({ kind: "idle" });
  const [tradeToast, setTradeToast] = useState<{
    kind: "demo" | "live" | "info" | "error";
    title: string;
    body?: string;
  } | null>(null);

  // Auto-clear toast after 4s.
  useEffect(() => {
    if (!tradeToast) return;
    const id = setTimeout(() => setTradeToast(null), 4_000);
    return () => clearTimeout(id);
  }, [tradeToast]);

  const showPendingTradePlan = useCallback(
    (side: "buy" | "sell", type?: PendingOrderTicketType) => {
      const entry = pendingOrderPrice ?? livePrice ?? data.lastPrice;
      const distance = draggablePlanDistance(data.candles, entry);
      setPendingOrderSide(side);
      setExecutionMode("pending");
      setPendingOrderType(type ?? (side === "buy" ? "buy_limit" : "sell_limit"));
      setPendingOrderVisible(true);
      if (entry != null && Number.isFinite(entry)) {
        const sideChanged = side !== pendingOrderSide;
        setPendingOrderPrice(entry);
        setPendingStopLossPrice((prev) => (prev != null && !sideChanged ? prev : side === "buy" ? entry - distance : entry + distance));
        setPendingTakeProfitPrice((prev) =>
          prev != null && !sideChanged ? prev : side === "buy" ? entry + distance * 1.6 : entry - distance * 1.6,
        );
      }
    },
    [data.candles, data.lastPrice, livePrice, pendingOrderPrice, pendingOrderSide],
  );

  /**
   * Auto-flip buy/sell side when dragging the pending entry price line.
   * Limit orders: entry below live → buy_limit, entry above live → sell_limit.
   * Stop orders:  entry above live → buy_stop,  entry below live → sell_stop.
   */
  const handlePendingEntryPriceChange = useCallback(
    (newPrice: number) => {
      setPendingOrderPrice(newPrice);
      const ref = livePrice ?? data.lastPrice;
      if (ref == null || !Number.isFinite(ref)) return;
      const isStop = pendingOrderType === "buy_stop" || pendingOrderType === "sell_stop";
      if (isStop) {
        if (newPrice > ref && pendingOrderType !== "buy_stop") {
          setPendingOrderSide("buy");
          setPendingOrderType("buy_stop");
        } else if (newPrice < ref && pendingOrderType !== "sell_stop") {
          setPendingOrderSide("sell");
          setPendingOrderType("sell_stop");
        }
      } else {
        if (newPrice < ref && pendingOrderType !== "buy_limit") {
          setPendingOrderSide("buy");
          setPendingOrderType("buy_limit");
        } else if (newPrice > ref && pendingOrderType !== "sell_limit") {
          setPendingOrderSide("sell");
          setPendingOrderType("sell_limit");
        }
      }
    },
    [livePrice, data.lastPrice, pendingOrderType],
  );

  const tradeVolumeNum = useMemo(() => {
    const n = Number.parseFloat(tradeVolume);
    return Number.isFinite(n) && n > 0 ? n : 0.1;
  }, [tradeVolume]);

  /**
   * The "Send" pill on the pending plan overlay funnels through this. Branches:
   *   - Demo account → instant virtual fill (no broker contact).
   *   - Live account, flag off → toast + soft CTA pointing to /settings.
   *   - Live account, flag on → open ChartOrderConfirm; modal posts to API.
   */
  const handleSendCurrentPlan = useCallback((override?: {
    side?: "buy" | "sell";
    orderType?: OrderTicketType;
    entryPrice?: number | null;
  }) => {
    const orderType = override?.orderType ?? pendingOrderType;
    const side = override?.side ?? pendingOrderSide;
    const isMarketOrder = orderType === "market";
    const entry = isMarketOrder
      ? (override?.entryPrice ?? livePrice ?? data.lastPrice ?? null)
      : (override?.entryPrice ?? pendingOrderPrice ?? livePrice ?? data.lastPrice ?? null);
    if (entry == null || !Number.isFinite(entry)) {
      setTradeToast({
        kind: "error",
        title: "No live price yet",
        body: isMarketOrder
          ? "Wait for the next tick before sending a market order."
          : "Wait for the next tick before setting a pending order.",
      });
      return;
    }
    if (tradeVolumeNum <= 0) {
      setTradeToast({ kind: "error", title: "Pick a volume" });
      return;
    }

    if (isDemoAccount) {
      const opened = demoBook.open({
        symbol: data.symbol,
        side,
        volume: tradeVolumeNum,
        entryPrice: entry,
        stopLoss: isMarketOrder ? null : pendingStopLossPrice,
        takeProfit: isMarketOrder ? null : pendingTakeProfitPrice,
      });
      if (opened) {
        setPendingOrderVisible(false);
        setTradeToast({
          kind: "demo",
          title: `Demo ${side.toUpperCase()} ${data.symbol} ${isMarketOrder ? "market filled" : "plan filled"}`,
          body: `${tradeVolumeNum.toFixed(2)} lots @ ${formatBrokerPrice(data.brokerSymbol, entry)}. Virtual position only — no broker order sent.`,
        });
      } else {
        setTradeToast({
          kind: "error",
          title: "Couldn't open demo position",
          body: "Try reloading the chart.",
        });
      }
      return;
    }

    // Live MT5 account path
    if (!liveTrading.enabled) {
      setTradeToast({
        kind: "info",
        title: "Live trading is OFF on this device",
        body: "Open Settings → Live trading to activate. Demo Account paper trading still works.",
      });
      return;
    }

    if (!liveTrading.armed) {
      setTradeToast({
        kind: "info",
        title: "Re-arm to send live orders",
        body: "Open Settings → Live trading and tap “Arm for 30m”.",
      });
      return;
    }

    setOrderConfirmStatus({ kind: "idle" });
    setOrderConfirmInput({
      symbol: data.symbol,
      brokerSymbol: data.brokerSymbol,
      side,
      orderType,
      volume: tradeVolumeNum,
      digits: priceDigitsForSymbol(data.brokerSymbol),
      openPrice: isMarketOrder ? null : entry,
      livePrice,
      stopLoss: isMarketOrder ? null : pendingStopLossPrice,
      takeProfit: isMarketOrder ? null : pendingTakeProfitPrice,
      slippagePoints: deviationPoints,
      accountLabel: data.account?.label ?? "MT5 Account",
    });
  }, [
    data.account?.brokerAccountId,
    data.account?.label,
    data.brokerSymbol,
    data.lastPrice,
    data.symbol,
    demoBook,
    deviationPoints,
    isDemoAccount,
    liveTrading.armed,
    liveTrading.enabled,
    livePrice,
    pendingOrderPrice,
    pendingOrderSide,
    pendingOrderType,
    pendingStopLossPrice,
    pendingTakeProfitPrice,
    tradeVolumeNum,
  ]);

  const sendLiveConfirmedOrder = useCallback(async () => {
    const brokerAccountId = data.account?.brokerAccountId;
    if (!orderConfirmInput || !brokerAccountId) return;
    setOrderConfirmStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/mt5/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerAccountId,
          symbol: orderConfirmInput.brokerSymbol,
          side: orderConfirmInput.side,
          orderType: orderConfirmInput.orderType,
          volume: orderConfirmInput.volume,
          openPrice: orderConfirmInput.openPrice,
          stopLoss: orderConfirmInput.stopLoss,
          takeProfit: orderConfirmInput.takeProfit,
          slippage: orderConfirmInput.slippagePoints,
          comment: "AXE",
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        stringCode?: string;
        orderId?: string;
        positionId?: string;
        code?: string;
      };
      if (res.ok && payload.ok) {
        setOrderConfirmStatus({
          kind: "ok",
          message: `${orderConfirmInput.side.toUpperCase()} sent — ${payload.stringCode ?? "TRADE_RETCODE_DONE"}${
            payload.positionId ? ` · position ${payload.positionId}` : ""
          }.`,
        });
        setPendingOrderVisible(false);
        setTimeout(() => {
          setOrderConfirmInput(null);
          setOrderConfirmStatus({ kind: "idle" });
          setTradeToast({
            kind: "live",
            title: `${orderConfirmInput.side.toUpperCase()} ${orderConfirmInput.symbol} sent`,
            body: `${orderConfirmInput.volume.toFixed(2)} lots — broker accepted the order.`,
          });
        }, 1_200);
      } else {
        setOrderConfirmStatus({
          kind: "error",
          message:
            payload.message ??
            (res.status >= 500 ? "Broker is unreachable. No order sent." : "Order rejected by the broker."),
        });
      }
    } catch (err) {
      setOrderConfirmStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error — no order sent.",
      });
    }
  }, [data.account?.brokerAccountId, orderConfirmInput]);

  // Load saved annotations when symbol/tf changes
  useEffect(() => {
    queueMicrotask(() => {
      setAnnotations(loadAnnotations(data.symbol, data.timeframeKey));
      setAnnotationsLoadedKey(`${data.symbol}|${data.timeframeKey}`);
      setDrawingMode(null);
      drawingPointsRef.current = [];
      setDrawingHint(null);
      setPendingOrderVisible(false);
      setPendingStopLossPrice(null);
      setPendingTakeProfitPrice(null);
    });
  }, [data.symbol, data.timeframeKey]);

  useEffect(() => {
    window.localStorage.setItem("axe_active_symbol", data.symbol);
    window.localStorage.setItem("axe_active_tf", data.timeframeKey);
  }, [data.symbol, data.timeframeKey]);

  useEffect(() => {
    setPendingOrderPrice((prev) => prev ?? data.lastPrice);
  }, [data.lastPrice]);

  useEffect(() => {
    // Lock both <html> and <body> to the viewport so the chart screen can't
    // be pulled past the top/bottom of the device. Setting position:fixed on
    // <body> is the only reliable way to stop iOS Safari rubber-band scroll.
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden";
    html.style.height = "100dvh";
    body.style.overflow = "hidden";
    body.style.height = "100dvh";
    body.style.position = "fixed";
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
    };
  }, []);

  // Live mirror of the last candle so the indicator panes (RSI/Volume) can
  // tick in lockstep with the candle stream instead of staying frozen on the
  // server-rendered snapshot. We seed it from data.candles so the very first
  // tick already has somewhere to land.
  const [liveLastCandle, setLiveLastCandle] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    tickVolume?: number;
    volume?: number;
  } | null>(() => {
    const last = data.candles[data.candles.length - 1];
    return last ? { ...last } : null;
  });

  // When data.candles changes (symbol/tf navigation), reseed the live mirror
  // from the new history so we don't bleed the previous symbol's state.
  useEffect(() => {
    const last = data.candles[data.candles.length - 1];
    setLiveLastCandle(last ? { ...last } : null);
  }, [data.candles]);

  // Recent candle TIMES (unix seconds) used by FutureProjectionCursor to
  // measure pixel-per-bar reliably. Recomputed when the candle stream
  // changes so live appended bars are reflected immediately.
  const recentCandleTimes = useMemo<number[]>(() => {
    const times: number[] = [];
    const slice = data.candles.slice(-16);
    for (const candle of slice) {
      const ms = Date.parse(candle.time);
      if (!Number.isNaN(ms)) times.push(Math.floor(ms / 1000));
    }
    return times;
  }, [data.candles]);

  // Merge the live last candle into the historical array. RSI/Volume read
  // this so they reflect every tick that comes in.
  const liveCandles = useMemo(() => {
    if (!liveLastCandle || data.candles.length === 0) return data.candles;
    const lastIdx = data.candles.length - 1;
    const lastTime = data.candles[lastIdx]?.time;
    if (lastTime === liveLastCandle.time) {
      const merged = data.candles.slice(0, lastIdx);
      merged.push({ ...data.candles[lastIdx], ...liveLastCandle });
      return merged;
    }
    // Newer candle — append.
    return [...data.candles, liveLastCandle];
  }, [data.candles, liveLastCandle]);

  // Standalone in-app alert evaluator. Runs whether or not TradingOS is
  // online. The chart's live tick stream is the source of truth.
  const { evaluate: evaluateAlerts } = useAlertEvaluator({
    enabled: liveEnabled,
    symbol: data.symbol,
    cooldownSeconds: 60,
    onFire: (event) => {
      setFiredAlert(event);
      setSnapshotMessage(`Alert · ${event.message}`);
      setTimeout(() => setSnapshotMessage(null), 4_500);
    },
  });

  const onTick = useCallback(
    ({ mid, bid, ask, time }: { mid: number | null; bid: number | null; ask: number | null; time: string | null }) => {
      if (mid == null || !Number.isFinite(mid)) return;
      if (sessionState.state !== "open" && !eventFreshEnough(time)) return;
      setLiveBid(bid);
      setLiveAsk(ask);
      canvasRef.current?.applyTick(mid);
      // Update the mirrored last candle's close so RSI/Volume see live data.
      setLiveLastCandle((prev) => {
        if (!prev) return prev;
        const high = Math.max(prev.high, mid);
        const low = Math.min(prev.low, mid);
        const tickVolume = (prev.tickVolume ?? 0) + 1;
        return { ...prev, close: mid, high, low, tickVolume };
      });
      // Evaluate alerts every tick — cheap, and the hook handles cooldown.
      evaluateAlerts(mid);
      const now = Date.now();
      if (now - lastReactPriceAt.current >= TICK_REACT_THROTTLE_MS) {
        lastReactPriceAt.current = now;
        setLivePrice(mid);
        setLastTickAt(time ?? new Date().toISOString());
      }
    },
    [evaluateAlerts, sessionState.state],
  );

  const onCandleUpdate = useCallback(
    (candle: { time: string; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number }) => {
      if (sessionState.state !== "open" && !eventFreshEnough(candle.time)) return;
      canvasRef.current?.updateLastCandle(candle);
      // Mirror to React state so the indicator panes recompute on each
      // candle update — guarantees RSI / Volume tick live with the chart.
      setLiveLastCandle((prev) => {
        const sameBucket = prev?.time === candle.time;
        const canonicalClose = sameBucket && livePrice != null && Number.isFinite(livePrice)
          ? livePrice
          : candle.close;
        return {
          time: candle.time,
          open: candle.open,
          high: Math.max(candle.high, canonicalClose),
          low: Math.min(candle.low, canonicalClose),
          close: canonicalClose,
          tickVolume: candle.tickVolume,
          volume: candle.volume,
        };
      });
      // Candle close updates the candle body only. The visible quote stays
      // on the current bid/ask mid so candle-close and tick streams cannot
      // fight each other visually.
    },
    [livePrice, sessionState.state],
  );

  const onPositions = useCallback(({ total, onSymbol }: { total: number; onSymbol: LivePosition[] }) => {
    setLivePositionsCount((prev) => (prev === total ? prev : total));
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
    setOverlays((prev) => (sameOverlayRows(prev, next) ? prev : next));
  }, []);

  const {
    status: liveStatus,
    transport: liveTransport,
    reason: liveReason,
    lastUpdateAt: liveLastUpdateAt,
    reconnectAttempt,
  } = useLiveChart({
    enabled: liveEnabled,
    accountId,
    displaySymbol: data.symbol,
    brokerSymbol: data.brokerSymbol,
    timeframeKey: data.timeframeKey,
    onTick,
    onCandleUpdate,
    onPositions,
  });

  // Canonical chart runtime snapshot. Chat, Watchlist and Alerts read this
  // same Supabase row, so write it as soon as broker candles hydrate and then
  // keep it fresh while live data arrives.
  useEffect(() => {
    if (data.failure !== "ok" || !accountId || !data.brokerSymbol) return;
    const post = () => {
      const lastCandle = liveLastCandle ?? data.candles.at(-1) ?? null;
      const fresh =
        liveLastUpdateAt != null &&
        Date.now() - Date.parse(liveLastUpdateAt) < 30_000 &&
        (liveStatus === "connected" || liveStatus === "live_stream");
      const status =
        fresh
          ? "live"
          : sessionState.state !== "open"
            ? sessionState.state
            : liveStatus === "offline" || liveStatus === "failed"
              ? liveStatus
              : "degraded";
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
          lastBid: liveBid,
          lastAsk: liveAsk,
          lastTickAt,
          lastCandleAt: lastCandle?.time ?? data.lastCandleTime,
          lastCandle,
          openPositionsCount: livePositionsCount,
          openPositions: overlays,
          status,
        }),
      }).catch(() => undefined);
    };
    post();
    const t = setInterval(post, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [
    data.failure,
    liveStatus,
    accountId,
    data.symbol,
    data.brokerSymbol,
    data.timeframeKey,
    data.candles,
    livePrice,
    liveBid,
    liveAsk,
    lastTickAt,
    data.lastCandleTime,
    liveLastCandle,
    liveLastUpdateAt,
    sessionState.state,
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
      setLiveBid(data.lastBid);
      setLiveAsk(data.lastAsk);
      setOverlays(data.positionsOnSymbol);
      setLivePositionsCount(data.totalPositions);
      setLastTickAt(data.lastTickAt);
    });
  }, [
    data.account?.brokerAccountId,
    data.brokerSymbol,
    data.timeframeKey,
    data.lastPrice,
    data.lastBid,
    data.lastAsk,
    data.lastTickAt,
    data.positionsOnSymbol,
    data.totalPositions,
  ]);

  useEffect(() => {
    if (sessionState.state === "open") return;
    setLivePrice(closedCanonicalPrice);
    setLiveBid(data.lastBid);
    setLiveAsk(data.lastAsk);
    setLastTickAt(null);
    const last = data.candles.at(-1);
    setLiveLastCandle(last ? { ...last } : null);
  }, [closedCanonicalPrice, data.candles, data.lastBid, data.lastAsk, sessionState.state]);

  const freshestRuntimeAt = sessionState.state === "open" ? liveLastUpdateAt : lastTickAt;
  const liveAge = formatLiveAge(freshestRuntimeAt);
  const liveFresh =
    freshestRuntimeAt != null &&
    Date.now() - Date.parse(freshestRuntimeAt) < 30_000 &&
    (liveStatus === "connected" || liveStatus === "live_stream");
  const statusPill = statusPillCopy(
    liveStatus,
    liveTransport,
    data.providerStatus,
    data.candles.length > 0,
    liveFresh,
    sessionState,
  );
  const liveDetail = useMemo(() => {
    if (data.providerStatus === "demo") return "Demo stream";
    if (sessionState.state !== "open" && !liveFresh) return sessionState.reason;
    if ((liveStatus === "connected" || liveStatus === "live_stream") && liveFresh) {
      return liveAge ? `Updated ${liveAge}` : "AXE Live feed";
    }
    if (liveStatus === "connected" || liveStatus === "live_stream") {
      return data.candles.length > 0 ? "Waiting for first live tick" : "Opening AXE Live";
    }
    if (liveStatus === "delayed_polling") {
      return liveAge ? `Poll updated ${liveAge}` : "SSE fallback active";
    }
    if (liveStatus === "reconnecting") {
      return reconnectAttempt > 0 ? `Recovering feed · attempt ${reconnectAttempt}` : "Recovering feed";
    }
    if (liveStatus === "stale") return liveAge ? `Last live tick ${liveAge}` : "Waiting for next broker tick";
    if (liveStatus === "offline") return liveAge ? `Cached from ${liveAge}` : "Cached broker candles";
    if (liveStatus === "connecting") return "Opening live feed";
    return data.candles.length > 0 ? "Cached candles" : "No live feed";
  }, [data.candles.length, data.providerStatus, liveAge, liveStatus, liveFresh, reconnectAttempt, sessionState]);
  const headerSeverity: "fresh" | "degraded" | "blocking" | "inactive" =
    data.failure !== "ok"
      ? "blocking"
      : liveFresh
        ? "fresh"
        : data.candles.length > 0 || sessionState.state !== "open"
          ? "degraded"
          : "inactive";
  const headerReason =
    headerSeverity === "fresh"
      ? "Fresh real broker tick received."
      : sessionState.state !== "open"
        ? sessionState.reason
        : data.failure !== "ok"
          ? failureCardCopy(data.failure)?.title ?? "Chart runtime is blocked."
          : liveDetail;

  const goSymbol = useCallback(
    (sym: string) => {
      setRouteFallbackMessage(null);
      startRouteTransition(() => {
        router.push(buildHref(accountId, sym, data.timeframeKey));
      });
    },
    [router, accountId, data.timeframeKey, startRouteTransition],
  );
  const goTf = useCallback(
    (key: string) => {
      setPendingTfKey(key);
      setRouteFallbackMessage(null);
      startRouteTransition(() => {
        router.push(buildHref(accountId, data.symbol, key));
      });
    },
    [router, accountId, data.symbol, startRouteTransition],
  );

  const lastPriceText = useMemo(
    () => formatBrokerPrice(data.brokerSymbol, livePrice),
    [data.brokerSymbol, livePrice],
  );
  const failureCopy = failureCardCopy(data.failure);
  const accountLabel = data.account?.label ?? null;

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

  const updateAnnotation = useCallback(
    (updated: ChartAnnotation) => {
      setAnnotations((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a));
        saveAnnotations(data.symbol, data.timeframeKey, next);
        return next;
      });
    },
    [data.symbol, data.timeframeKey],
  );

  const removeAnnotationById = useCallback(
    (id: string) => {
      const next = removeAnnotation(data.symbol, data.timeframeKey, id);
      setAnnotations(next);
    },
    [data.symbol, data.timeframeKey],
  );

  const appendAndRenderAnnotation = useCallback(
    (annotation: ChartAnnotation): ChartAnnotation[] => {
      const list = appendAnnotation(data.symbol, data.timeframeKey, annotation);
      setAnnotations(list);
      return list;
    },
    [data.symbol, data.timeframeKey],
  );

  const executeChartAction = useCallback(
    (command: ChartActionCommand): ChartActionResult => {
      const bus = new AxeChartActionBus({
        drawFibonacci: (cmd) => {
          const points = Array.isArray(cmd.payload.points) ? cmd.payload.points : [];
          const pointA = points[0] as AnnotationPoint | undefined;
          const pointB = points[1] as AnnotationPoint | undefined;

          if (!pointA || !pointB) {
            return {
              id: cmd.id,
              type: cmd.type,
              status: "failed",
              message: "AXE could not find two valid swing anchors for Fibonacci.",
            };
          }

          const now = new Date().toISOString();
          const payloadSettings =
            cmd.payload.settings && typeof cmd.payload.settings === "object"
              ? (cmd.payload.settings as Record<string, unknown>)
              : null;
          const annotation: ChartAnnotation = {
            id: cmd.id,
            accountId: cmd.accountId ?? null,
            symbol: cmd.symbol,
            timeframe: cmd.timeframe,
            type: "fib_retracement",
            points: [pointA, pointB],
            settings: {
              source: cmd.source,
              explanation: typeof cmd.payload.explanation === "string" ? cmd.payload.explanation : undefined,
              ...(payloadSettings ?? {}),
            },
            createdAt: now,
            updatedAt: now,
          };

          appendAndRenderAnnotation(annotation);
          return {
            id: cmd.id,
            type: cmd.type,
            status: "rendered",
            message: "AXE added Fibonacci to the chart. You can drag the anchors to adjust it.",
            annotation,
          };
        },
        drawTrendline: (cmd) => {
          const points = Array.isArray(cmd.payload.points) ? cmd.payload.points : [];
          if (points.length >= 2) {
            const now = new Date().toISOString();
            const payloadSettings =
              cmd.payload.settings && typeof cmd.payload.settings === "object"
                ? (cmd.payload.settings as Record<string, unknown>)
                : null;
            const annotation: ChartAnnotation = {
              id: cmd.id,
              accountId: cmd.accountId ?? null,
              symbol: cmd.symbol,
              timeframe: cmd.timeframe,
              type: "trendline",
              points: points.slice(0, 2) as AnnotationPoint[],
              settings: { source: cmd.source, ...(payloadSettings ?? {}) },
              createdAt: now,
              updatedAt: now,
            };
            appendAndRenderAnnotation(annotation);
            return {
              id: cmd.id,
              type: cmd.type,
              status: "rendered",
              message: "AXE added a trendline. You can drag the endpoints to adjust it.",
              annotation,
            };
          }

          startDrawing("trendline");
          return {
            id: cmd.id,
            type: cmd.type,
            status: "prepared",
            message: "Trendline tool ready. Tap two points on the chart.",
          };
        },
        markKeyLevel: (cmd) => {
          const price = Number(cmd.payload.price);
          if (!Number.isFinite(price)) {
            return {
              id: cmd.id,
              type: cmd.type,
              status: "prepared",
              message: "Key level action prepared. A price is required to render it.",
            };
          }

          const now = new Date().toISOString();
          const annotation: ChartAnnotation = {
            id: cmd.id,
            accountId: cmd.accountId ?? null,
            symbol: cmd.symbol,
            timeframe: cmd.timeframe,
            type: "horizontal_level",
            points: [{ time: Math.floor(Date.now() / 1000), price }],
            settings: { source: cmd.source, label: cmd.payload.label },
            createdAt: now,
            updatedAt: now,
          };
          appendAndRenderAnnotation(annotation);
          return {
            id: cmd.id,
            type: cmd.type,
            status: "rendered",
            message: "AXE marked the key level on the chart.",
            annotation,
          };
        },
        addIndicator: (cmd) => ({
          id: cmd.id,
          type: cmd.type,
          status: "prepared",
          message: "Indicator layer prepared, renderer not connected yet.",
        }),
        clearAiDrawings: (cmd) => {
          saveAnnotations(cmd.symbol, cmd.timeframe, []);
          setAnnotations([]);
          return {
            id: cmd.id,
            type: cmd.type,
            status: "rendered",
            message: "AXE cleared the chart drawings.",
            annotations: [],
          };
        },
      });

      const result = bus.dispatch(command);
      setSnapshotMessage(result.message);
      setTimeout(() => setSnapshotMessage(null), 4_000);
      return result;
    },
    [appendAndRenderAnnotation, startDrawing],
  );

  const executeActionByType = useCallback(
    (type: ChartActionCommand["type"], source: "axe" | "user" = "axe"): ChartActionResult => {
      if (type === "draw_fibonacci") {
        try {
          // The "sd" frontend mode is geometrically identical to "swing"
          // with offset 0 — both anchor to the latest swing High / Low.
          // We translate it down to the swing builder so the backend
          // FibSourceMode stays at three values (auto / swing / pd) and
          // the annotation it emits keeps the existing settings.source
          // semantics. The picker remembers "sd" separately so the user
          // can flip between Swing and S/D without losing intent.
          const builderMode = fibMode === "sd" ? "swing" : fibMode;
          const builderSwingOffset =
            fibMode === "swing" ? fibSwingOffset : 0;
          const command = buildFibonacciActionFromCandles({
            id: newAnnotationId(),
            source,
            symbol: data.symbol,
            timeframe: data.timeframeKey,
            accountId: accountId ?? undefined,
            candles: data.candles,
            strength: 3,
            mode: builderMode,
            swingOffset: builderSwingOffset,
          });
          return executeChartAction(command);
        } catch {
          const failed: ChartActionResult = {
            id: newAnnotationId(),
            type,
            status: "failed",
            message: "AXE could not find a clean recent swing. Try a different timeframe.",
          };
          setSnapshotMessage(failed.message);
          setTimeout(() => setSnapshotMessage(null), 4_000);
          return failed;
        }
      }

      if (type === "draw_trendline") {
        try {
          const command = buildTrendlineActionFromCandles({
            id: newAnnotationId(),
            source,
            symbol: data.symbol,
            timeframe: data.timeframeKey,
            accountId: accountId ?? undefined,
            candles: data.candles,
            strength: 3,
          });
          return executeChartAction(command);
        } catch {
          const failed: ChartActionResult = {
            id: newAnnotationId(),
            type,
            status: "failed",
            message: "AXE could not find a clean recent swing for a trendline.",
          };
          setSnapshotMessage(failed.message);
          setTimeout(() => setSnapshotMessage(null), 4_000);
          return failed;
        }
      }

      return executeChartAction({
        id: newAnnotationId(),
        type,
        source,
        symbol: data.symbol,
        timeframe: data.timeframeKey,
        accountId: accountId ?? undefined,
        payload: {},
      });
    },
    [accountId, data.candles, data.symbol, data.timeframeKey, executeChartAction, fibMode, fibSwingOffset],
  );

  // Rebuild auto-Fib whenever the user changes the source mode while a
  // Fib annotation is on the chart. Without this the picker would only
  // affect the *next* fib drawn — bad UX, since the user expects the
  // existing one to update immediately.
  const previousFibSourceRef = useRef<{ mode: FibMode; swingOffset: 0 | 1 | 2 | 3 }>({
    mode: fibMode,
    swingOffset: fibSwingOffset,
  });
  useEffect(() => {
    const previous = previousFibSourceRef.current;
    if (previous.mode === fibMode && previous.swingOffset === fibSwingOffset) return;
    previousFibSourceRef.current = { mode: fibMode, swingOffset: fibSwingOffset };
    const hasFib = annotations.some(
      (a) => a.type === "fib_retracement" && (a.settings as Record<string, unknown> | undefined)?.source === "user",
    );
    if (!hasFib) return;
    // Remove all user-source fib annotations, then redraw with the new
    // mode. We rely on `toggleAutoAnnotation` semantics — but call the
    // builder directly so we don't double-toggle.
    const fibs = annotations.filter((a) => a.type === "fib_retracement");
    let nextList = annotations;
    for (const ann of fibs) {
      nextList = removeAnnotation(data.symbol, data.timeframeKey, ann.id);
    }
    setAnnotations(nextList);
    // Defer to the next tick so the remove settles before we draw the
    // replacement.
    setTimeout(() => {
      executeActionByType("draw_fibonacci", "user");
    }, 0);
  }, [fibMode, fibSwingOffset, annotations, data.symbol, data.timeframeKey, executeActionByType]);

  // Tap the toolbar Fib/Trend button: if there's already an auto drawing of
  // that type on the chart, remove it (toggle off). Otherwise, draw a new one.
  // This matches the user's mental model: same button toggles the indicator
  // on/off, exactly like Vol/RSI/MA.
  const toggleAutoAnnotation = useCallback(
    (kind: "fib_retracement" | "trendline") => {
      const existing = annotations.filter((a) => a.type === kind);
      if (existing.length > 0) {
        let nextList = annotations;
        for (const ann of existing) {
          nextList = removeAnnotation(data.symbol, data.timeframeKey, ann.id);
        }
        setAnnotations(nextList);
        return;
      }
      executeActionByType(kind === "fib_retracement" ? "draw_fibonacci" : "draw_trendline", "user");
    },
    [annotations, data.symbol, data.timeframeKey, executeActionByType],
  );

  // Flip the existing fib so the 0% level switches between top and bottom.
  // Implementation: swap the two anchor points of every fib_retracement
  // annotation we have. The percentage labels are derived from `points[0]`
  // (= 0%) → `points[1]` (= 100%), so swapping flips the orientation in one
  // tap, exactly like MT5's "invert".
  const flipFibAnnotation = useCallback(() => {
    const fibs = annotations.filter((a) => a.type === "fib_retracement");
    if (fibs.length === 0) {
      executeActionByType("draw_fibonacci", "user");
      return;
    }
    const now = new Date().toISOString();
    setAnnotations((prev) => {
      const next = prev.map((a) => {
        if (a.type !== "fib_retracement" || a.points.length < 2) return a;
        return { ...a, points: [a.points[1], a.points[0]], updatedAt: now };
      });
      saveAnnotations(data.symbol, data.timeframeKey, next);
      return next;
    });
  }, [annotations, data.symbol, data.timeframeKey, executeActionByType]);

  useEffect(() => {
    if (!initialAction) return;
    if (annotationsLoadedKey !== `${data.symbol}|${data.timeframeKey}`) return;
    if (data.failure !== "ok") return;

    const normalized = initialAction.toLowerCase();
    const action =
      normalized === "draw_fibonacci" || normalized === "draw_trendline" || normalized === "clear_ai_drawings"
        ? normalized
        : null;
    if (!action) return;

    executeActionByType(action);

    const params = new URLSearchParams(window.location.search);
    params.delete("action");
    const next = params.toString();
    router.replace(next ? `/chart?${next}` : "/chart", { scroll: false });
  }, [
    annotationsLoadedKey,
    data.failure,
    data.symbol,
    data.timeframeKey,
    executeActionByType,
    initialAction,
    router,
  ]);

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
          lastBid: liveBid,
          lastAsk: liveAsk,
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
  }, [accountId, data, livePrice, liveBid, liveAsk, lastTickAt, livePositionsCount, overlays, liveStatus]);

  const resetChartView = useCallback(() => {
    const nextIndex = (scaleModeIndex + 1) % CHART_SCALE_MODES.length;
    setScaleModeIndex(nextIndex);
    canvasRef.current?.setViewportPreset(nextIndex);
    setSnapshotMessage(CHART_SCALE_MODES[nextIndex].label);
    setTimeout(() => setSnapshotMessage(null), 2_500);
  }, [scaleModeIndex]);

  const toggleToolFlag = useCallback((id: string) => {
    setActiveToolFlags((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleIndicatorFlag = useCallback((id: string) => {
    setIndicatorToolFlags((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("axe.chart.indicatorFlags", JSON.stringify(next));
      } catch {
        /* localStorage may be blocked */
      }
      return next;
    });
  }, []);

  const toolbarSections: AxeToolbarSection[] = useMemo(() => {
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
        id: "actions",
        title: "Actions",
        items: [
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
        ],
      },
    ];
  }, [
    data.symbol,
    tfLabel,
    overlays.length,
    accountLabel,
    saveSnapshotToVault,
  ]);

  // Mobile top bar: menu left, the four chart shortcuts (Depth, News,
  // Indicators, Settings) sit in the center, AXE context/logo action
  // stays on the right. Order Book + News slide out from the left edge
  // so the trader can glance at depth or headlines without ever leaving
  // the chart screen.
  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    const baseBtn =
      "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-black/72 text-white/80 shadow-[0_8px_20px_rgba(0,0,0,0.45)] backdrop-blur active:scale-95";
    const idle = "border-white/[0.10]";
    const active = "border-white/[0.18] bg-white/[0.06] text-white";
    setCenter(
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => (orderBookOpen ? setOrderBookOpen(false) : openOrderBook())}
          className={`${baseBtn} ${orderBookOpen ? active : idle}`}
          aria-label="Market depth"
          title="Market depth"
          aria-pressed={orderBookOpen}
        >
          <BarChart2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => (newsOpen ? setNewsOpen(false) : openNews())}
          className={`${baseBtn} ${newsOpen ? active : idle}`}
          aria-label="News and intel"
          title="News & intel"
          aria-pressed={newsOpen}
        >
          <Newspaper className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setOneClickVisible((v) => !v);
            if (!oneClickVisible) {
              setExecutionMode("market");
              setPendingOrderVisible(false);
            }
          }}
          className={`${baseBtn} ${oneClickVisible ? active : idle}`}
          style={oneClickVisible ? { borderColor: "rgba(0,212,245,0.35)", boxShadow: "0 0 10px rgba(0,212,245,0.18)" } : undefined}
          aria-label="1-Click Trade"
          title="1-Click Trade"
          aria-pressed={oneClickVisible}
        >
          <Zap className="h-3.5 w-3.5" style={oneClickVisible ? { color: "#00d4f5" } : undefined} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (executionMode === "pending" && pendingOrderVisible) {
              setExecutionMode("market");
              setPendingOrderVisible(false);
            } else {
              showPendingTradePlan(pendingOrderSide, pendingOrderSide === "buy" ? "buy_limit" : "sell_limit");
              setOneClickVisible(true);
            }
          }}
          className={`${baseBtn} ${executionMode === "pending" && pendingOrderVisible ? active : idle}`}
          aria-label="Limit / Stop order"
          title="Limit / Stop order"
          aria-pressed={executionMode === "pending" && pendingOrderVisible}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      </div>,
    );
    setRight(
      <AxeContextToolbar title="Chart" subtitle={`${data.symbol} · ${tfLabel}`} sections={toolbarSections} />,
    );
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [
    setCenter,
    setRight,
    setToolRailOpen,
    resetChartView,
    data.symbol,
    tfLabel,
    toolbarSections,
    orderBookOpen,
    newsOpen,
    openOrderBook,
    openNews,
    oneClickVisible,
    executionMode,
    pendingOrderVisible,
    pendingOrderSide,
    showPendingTradePlan,
  ]);

  return (
    <div
      className="tos-ambient-glow fixed inset-x-0 bottom-[var(--tos-nav-offset)] top-[var(--tos-topbar-offset)] z-30 flex min-h-0 flex-col overflow-hidden overscroll-none md:static md:inset-auto md:z-auto md:h-auto md:flex-1 md:overflow-visible"
    >
      <LiveStatusReporter
        liveCount={headerSeverity === "fresh" ? 1 : 0}
        totalCount={1}
        freshestAgeSec={liveFresh && freshestRuntimeAt ? Math.max(0, Math.round((Date.now() - Date.parse(freshestRuntimeAt)) / 1000)) : null}
        label={`Chart · ${data.symbol}`}
        allLiveOverride={headerSeverity === "fresh" ? true : headerSeverity === "inactive" ? null : false}
        severity={headerSeverity}
        reason={headerReason}
      />
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
          title={liveReason ?? liveDetail}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusPill.dot}`} aria-hidden />
          {statusPill.label}
          <span className="hidden border-l border-current/20 pl-1.5 font-normal normal-case tracking-normal opacity-80 lg:inline">
            {liveDetail}
          </span>
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
        <div className="mt-2 hidden items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-white/90 md:flex">
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

      {/* Chart frame — flat, edge-attached trading canvas */}
      <div
        className="relative mx-0 mt-0 min-h-0 flex-1 overflow-hidden border-t border-white/[0.08] md:min-h-[420px] md:rounded-none md:border-x"
        style={{ background: CHART_THEME.background }}
      >
        <ChartCanvas
          ref={canvasRef}
          candles={data.candles}
          overlays={overlays}
          symbol={data.brokerSymbol}
          annotations={annotations}
          drawingMode={drawingMode}
          navigationLocked={pendingOrderVisible && executionMode === "pending"}
          onPointClick={handlePointClick}
        />

        <ChartIndicatorLayer
          candles={liveCandles}
          canvasRef={canvasRef}
          futureProjectionX={futureProjectionX}
          orderBlockCount={orderBlockCount}
          inverseFvgCount={inverseFvgCount}
          fvgCount={fvgCount}
          projectionCount={projectionCount}
          active={{
            ma: indicatorToolFlags.ma,
            bollinger: indicatorToolFlags.bollinger,
            vwap: indicatorToolFlags.vwap,
            poc: indicatorToolFlags.poc,
            structure: activeToolFlags.structure,
            orderBlocks: activeToolFlags.orderBlocks,
            fvg: activeToolFlags.fvg,
            ifvg: activeToolFlags.ifvg,
            pdh: activeToolFlags.pdh,
            pdl: activeToolFlags.pdl,
            pdq: activeToolFlags.pdq,
            swingPoints: activeToolFlags.swingPoints,
            supplyDemand: activeToolFlags.supplyDemand,
          }}
        />

        {/* Draggable future-projection vertical cursor — anchors how far
            the iFVG/FVG/OB/Fib extensions reach to the right of the last
            candle. Hidden until the user toggles it on; remembers offset
            per (symbol, timeframe). */}
        <FutureProjectionCursor
          canvasRef={canvasRef}
          recentCandleTimes={recentCandleTimes}
          storageKey={futureCursorStorageKey}
          enabled={futureCursorEnabled}
          onChange={setFutureProjectionX}
        />

        {pendingOrderVisible && executionMode === "pending" ? (
          <>
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingOrderPrice}
              label={orderTypeLabel(pendingOrderType)}
              color={pendingOrderSide === "buy" ? "#22D3EE" : "#E13947"}
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={handlePendingEntryPriceChange}
            />
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingStopLossPrice}
              label="SL"
              color="#E13947"
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={setPendingStopLossPrice}
              dashed
            />
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingTakeProfitPrice}
              label="TP"
              color="#22D3EE"
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={setPendingTakeProfitPrice}
              dashed
            />
            <button
              type="button"
              onClick={() => {
                setPendingOrderVisible(false);
                setExecutionMode("market");
              }}
              className="absolute right-3 top-12 z-30 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/82 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur"
              aria-label="Cancel pending order overlay"
            >
              <span aria-hidden>✕</span>
              <span>Clear plan</span>
            </button>
            {/* Send pill — sole entry point for actually opening a position.
                Demo: virtual fill. Live: ChartOrderConfirm. */}
            <button
              type="button"
              onClick={() => handleSendCurrentPlan()}
              className={`absolute right-3 top-[5.25rem] z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur transition ${
                pendingOrderSide === "buy"
                  ? "border border-white/[0.18] bg-white/[0.10] text-white/90 hover:bg-white/[0.12]"
                  : "border border-rose-300/60 bg-rose-400/22 text-rose-50 hover:bg-rose-400/30"
              }`}
              aria-label={`Send ${pendingOrderSide.toUpperCase()} ${
                isDemoAccount ? "(demo virtual fill)" : "(live order)"
              }`}
            >
              {pendingOrderSide === "buy" ? "▲" : "▼"}{" "}
              {isDemoAccount ? "Send · DEMO" : liveTrading.enabled ? "Send · LIVE" : "Live OFF"}
            </button>
          </>
        ) : null}

        <div className="absolute left-0 right-0 top-0 z-30 border-b border-white/[0.06] bg-black/72 px-2.5 py-1.5 backdrop-blur-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Symbol chip */}
              <div className="relative">
                <select
                  value={data.symbol}
                  onChange={(e) => goSymbol(e.target.value)}
                  className="min-w-0 max-w-[7.5rem] appearance-none rounded-lg border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 pr-5 font-mono text-[12px] font-bold uppercase tracking-tight text-cyan-400 outline-none transition-colors hover:bg-white/[0.08]"
                  aria-label="Symbol"
                >
                  {data.symbolOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-cyan-400/60" />
              </div>
              {/* Timeframe chip */}
              <div className="relative">
                <select
                  value={pendingTfKey ?? data.timeframeKey}
                  onChange={(e) => goTf(e.target.value)}
                  className="appearance-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 pr-5 font-mono text-[12px] font-semibold uppercase text-white/80 outline-none transition-colors hover:bg-white/[0.07]"
                  aria-label="Timeframe"
                >
                  {CHART_TF_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40" />
              </div>
              {/* Live price */}
              <span className="font-mono text-[11px] font-medium text-white/70">{lastPriceText}</span>
            </div>
            {/* Session state */}
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-tos-dim">
              {sessionCopy()}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setToolRailOpen((v) => !v)}
          className={`absolute left-0 top-[36%] z-40 grid h-16 w-6 -translate-y-1/2 place-items-center rounded-r-2xl border border-l-0 backdrop-blur transition ${
            toolRailOpen
              ? "border-white/[0.14] bg-white/[0.08] text-white shadow-[0_0_24px_rgba(255,255,255,0.2)]"
              : "border-white/[0.08] bg-black/78 text-white/80"
          }`}
          aria-label="Toggle SMC chart toolbar"
        >
          <span className="h-8 w-1 rounded-full bg-current opacity-80" aria-hidden />
        </button>

        <div
          className={`absolute left-0 top-[36%] z-30 w-[13.75rem] max-h-[46vh] -translate-y-1/2 overflow-y-auto rounded-r-2xl border border-l-0 border-white/10 bg-black/82 p-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl transition-transform ${
            toolRailOpen ? "translate-x-6" : "pointer-events-none -translate-x-full"
          }`}
        >
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70">Chart tools</div>
          <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "axe", label: "AXE", icon: MessageSquare, active: false, action: () => router.push(chatQ(`[AXE · chart ${data.symbol} ${tfLabel}]\nRead this chart and tell me what matters now.`)) },
            {
              id: "fib",
              label: "Auto Fib",
              icon: Spline,
              active: hasFibAnnotation,
              action: () => toggleAutoAnnotation("fib_retracement"),
            },
            {
              id: "fibFlip",
              label: "Flip Fib",
              icon: ArrowUpDown,
              active: false,
              disabled: !hasFibAnnotation,
              action: flipFibAnnotation,
            },
            {
              id: "trend",
              label: "Auto Trend",
              icon: TrendingUp,
              active: hasTrendAnnotation,
              action: () => toggleAutoAnnotation("trendline"),
            },
            { id: "structure", label: "Structure", icon: Sparkles, active: Boolean(activeToolFlags.structure), action: () => toggleToolFlag("structure") },
            { id: "orderBlocks", label: "OB", icon: Layers, active: Boolean(activeToolFlags.orderBlocks), action: () => toggleToolFlag("orderBlocks") },
            { id: "fvg", label: "FVG", icon: Square, active: Boolean(activeToolFlags.fvg), action: () => toggleToolFlag("fvg") },
            { id: "ifvg", label: "iFVG", icon: GitBranch, active: Boolean(activeToolFlags.ifvg), action: () => toggleToolFlag("ifvg") },
            { id: "pdh", label: "PDH", icon: Maximize2, active: Boolean(activeToolFlags.pdh), action: () => toggleToolFlag("pdh") },
            { id: "pdl", label: "PDL", icon: Maximize2, active: Boolean(activeToolFlags.pdl), action: () => toggleToolFlag("pdl") },
            { id: "pdq", label: "PDQ", icon: Maximize2, active: Boolean(activeToolFlags.pdq), action: () => toggleToolFlag("pdq") },
            { id: "supplyDemand", label: "S/D", icon: Layers, active: Boolean(activeToolFlags.supplyDemand), action: () => toggleToolFlag("supplyDemand") },
            { id: "swingPoints", label: "Swings", icon: GitBranch, active: Boolean(activeToolFlags.swingPoints), action: () => toggleToolFlag("swingPoints") },
            // Future projection cursor — toggleable so traders who don't
            // need it can keep the chart frame totally clean. Persisted
            // per-symbol/timeframe via the cursor's own storage key.
            {
              id: "futureCursor",
              label: "Project",
              icon: MoveHorizontal,
              active: futureCursorEnabled,
              action: () => setFutureCursorEnabled((v) => !v),
            },
          ].map((item) => {
            const Icon = item.icon;
            const isDisabled = "disabled" in item && item.disabled;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                disabled={isDisabled}
                title={item.label}
                className={`flex h-11 flex-col items-center justify-center rounded-xl border text-[10px] transition ${
                  isDisabled
                    ? "cursor-not-allowed border-white/[0.04] bg-white/[0.02] text-tos-dim opacity-50"
                    : item.active
                      ? "border-white/[0.14] bg-white/[0.08] text-white"
                      : "border-white/[0.06] bg-white/[0.035] text-tos-muted hover:text-white"
                }`}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-wide">{item.label}</span>
              </button>
            );
          })}

          {/* OB count picker — only visible while the OB indicator is on.
              Lets the user choose how many bullish + bearish blocks to
              show (1 each = cleanest, up to 3 each for context). */}
          {activeToolFlags.orderBlocks ? (
            <div className="col-span-3 mt-1 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                OB · per side
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((value) => {
                  const isActive = orderBlockCount === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateOrderBlockCount(value as 1 | 2 | 3)}
                      className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-semibold transition ${
                        isActive
                          ? "border-white/[0.16] bg-white/[0.10] text-white"
                          : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                      }`}
                      aria-label={`Show ${value} order block${value === 1 ? "" : "s"} per direction`}
                      aria-pressed={isActive}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* FVG count picker — mirrors OB / iFVG. Latest N bullish + N
              bearish unmitigated gaps. Only visible while FVG is on. */}
          {activeToolFlags.fvg ? (
            <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                FVG · per side
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((value) => {
                  const isActive = fvgCount === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateFvgCount(value as 1 | 2 | 3)}
                      className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-semibold transition ${
                        isActive
                          ? "border-white/[0.16] bg-white/[0.10] text-white"
                          : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                      }`}
                      aria-label={`Show ${value} FVG${value === 1 ? "" : "s"} per direction`}
                      aria-pressed={isActive}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* iFVG count picker — same UX as OB. Only visible while iFVG
              is on. Useful iFVGs (no second mitigation) extend forward
              to the future-projection cursor; reclaimed ones stop at
              the inversion candle. */}
          {activeToolFlags.ifvg ? (
            <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                iFVG · per side
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((value) => {
                  const isActive = inverseFvgCount === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateInverseFvgCount(value as 1 | 2 | 3)}
                      className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-semibold transition ${
                        isActive
                          ? "border-white/[0.16] bg-white/[0.10] text-white"
                          : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                      }`}
                      aria-label={`Show ${value} iFVG${value === 1 ? "" : "s"} per direction`}
                      aria-pressed={isActive}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Projection count picker — visible when "Project" mode is on.
              Controls how many of each indicator (OB / FVG / iFVG)
              extend forward to the projection cursor. 1 = only the
              latest, 2 / 3 = latest two / three. */}
          {futureCursorEnabled ? (
            <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                Project · per side
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((value) => {
                  const isActive = projectionCount === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateProjectionCount(value as 1 | 2 | 3)}
                      className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-semibold transition ${
                        isActive
                          ? "border-white/[0.16] bg-white/[0.10] text-white"
                          : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                      }`}
                      aria-label={`Project ${value} indicator${value === 1 ? "" : "s"} per direction`}
                      aria-pressed={isActive}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Auto-Fib source picker — appears whenever a Fib annotation
              is on the chart. "Auto" picks the latest good leg, "Swing"
              forces market-structure (HH/HL or LH/LL), "Day" maps the
              fib across yesterday's PDH ↔ PDL range, "S/D" anchors the
              fib to the same swing High / Low the standalone Supply /
              Demand indicator uses (so band edges and fib 0% / 100%
              snap to the same levels). */}
          {hasFibAnnotation ? (
            <>
              <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                  Fib · source
                </span>
                <div className="flex items-center gap-1">
                  {([
                    { value: "auto", label: "Auto" },
                    { value: "swing", label: "Swing" },
                    { value: "pd", label: "Day" },
                    { value: "sd", label: "S/D" },
                  ] as Array<{ value: FibMode; label: string }>).map((opt) => {
                    const isActive = fibMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateFibMode(opt.value)}
                        className={`grid h-6 min-w-[2.4rem] place-items-center rounded-md border px-1.5 text-[9.5px] font-semibold uppercase tracking-wide transition ${
                          isActive
                            ? "border-white/[0.16] bg-white/[0.10] text-white"
                            : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                        }`}
                        aria-label={`Fib source ${opt.label}`}
                        aria-pressed={isActive}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-fib extension pills. Default is left=off (3-bar
                  visual clip in front of the live candle) + right=on
                  (auto-fib forward projection). Trader can toggle either
                  side independently to widen or tighten the rendered fib
                  without touching the underlying anchors. Persisted on
                  every fib annotation via setFibExtendOnAll. */}
              <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                  Fib · extend
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFibExtendOnAll("extendLeft", !allFibsExtendLeft)}
                    className={`grid h-6 min-w-[2.4rem] place-items-center rounded-md border px-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                      allFibsExtendLeft
                        ? "border-white/[0.16] bg-white/[0.10] text-white"
                        : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                    }`}
                    aria-label="Extend fib lines left"
                    aria-pressed={allFibsExtendLeft}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setFibExtendOnAll("extendRight", !allFibsExtendRight)}
                    className={`grid h-6 min-w-[2.4rem] place-items-center rounded-md border px-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                      allFibsExtendRight
                        ? "border-white/[0.16] bg-white/[0.10] text-white"
                        : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                    }`}
                    aria-label="Extend fib lines right"
                    aria-pressed={allFibsExtendRight}
                  >
                    →
                  </button>
                </div>
              </div>

              {fibMode === "swing" ? (
                <div className="col-span-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] px-2 py-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
                    Swing leg
                  </span>
                  <div className="flex items-center gap-1">
                    {([
                      { value: 0, label: "0" },
                      { value: 1, label: "-1" },
                      { value: 2, label: "-2" },
                      { value: 3, label: "-3" },
                    ] as Array<{ value: 0 | 1 | 2 | 3; label: string }>).map((opt) => {
                      const isActive = fibSwingOffset === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateFibSwingOffset(opt.value)}
                          className={`grid h-6 min-w-[1.8rem] place-items-center rounded-md border px-1.5 text-[9.5px] font-semibold uppercase tracking-wide transition ${
                            isActive
                              ? "border-white/[0.16] bg-white/[0.10] text-white"
                              : "border-white/[0.06] bg-white/[0.04] text-tos-muted hover:text-white"
                          }`}
                          aria-label={`Use swing leg ${opt.label}`}
                          aria-pressed={isActive}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIndicatorRailOpen((v) => !v)}
          className={`absolute left-0 top-[70%] z-40 grid h-16 w-6 -translate-y-1/2 place-items-center rounded-r-2xl border border-l-0 backdrop-blur transition ${
            indicatorRailOpen
              ? "border-amber-300/45 bg-amber-400/18 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.18)]"
              : "border-amber-400/18 bg-black/78 text-amber-200"
          }`}
          aria-label="Toggle indicator toolbar"
        >
          <span className="h-8 w-1 rounded-full bg-current opacity-80" aria-hidden />
        </button>

        <div
          className={`absolute left-0 top-[70%] z-30 w-[13.75rem] -translate-y-1/2 rounded-r-2xl border border-l-0 border-white/10 bg-black/82 p-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl transition-transform ${
            indicatorRailOpen ? "translate-x-6" : "pointer-events-none -translate-x-full"
          }`}
        >
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100/85">
            Indicators
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "volume", label: "VOL", icon: BarChart3 },
              { id: "ma", label: "MA", icon: LineChart },
              { id: "macd", label: "MACD", icon: Activity },
              { id: "bollinger", label: "BOL", icon: BarChart2 },
              { id: "rsi", label: "RSI", icon: Activity },
              { id: "vwap", label: "VWAP", icon: Landmark },
              { id: "poc", label: "POC", icon: Crosshair },
            ].map((item) => {
              const Icon = item.icon;
              const active = Boolean(indicatorToolFlags[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleIndicatorFlag(item.id)}
                  title={item.label}
                  className={`flex h-11 flex-col items-center justify-center rounded-xl border text-[10px] transition ${
                    active
                      ? "border-amber-300/45 bg-amber-400/16 text-amber-100"
                      : "border-white/[0.06] bg-white/[0.035] text-tos-muted hover:text-amber-100"
                  }`}
                  aria-label={`Toggle ${item.label}`}
                  aria-pressed={active}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drawing overlays: must NOT steal chart pan/zoom except on handles */}
        <div className="pointer-events-none absolute inset-0 z-[25]">
          <FibAnnotationLayer
            annotations={annotations}
            canvasRef={canvasRef}
            digits={priceDigitsForSymbol(data.brokerSymbol)}
            onUpdate={updateAnnotation}
            onRemove={removeAnnotationById}
            futureProjectionX={futureProjectionX}
            lastBarTimeSec={recentCandleTimes[recentCandleTimes.length - 1] ?? null}
            prevBarTimeSec={recentCandleTimes[recentCandleTimes.length - 2] ?? null}
          />

          {/* Interactive Trendline layer — draggable endpoints */}
          <TrendlineAnnotationLayer
            annotations={annotations}
            canvasRef={canvasRef}
            onUpdate={updateAnnotation}
            onRemove={removeAnnotationById}
            futureProjectionX={futureProjectionX}
          />
        </div>

        {/* Failure overlay sits on top of the chart frame so layout stays stable */}
        {failureCopy ? (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-b from-[#04070C]/35 via-[#04070C]/72 to-[#04070C]/96 p-4 sm:items-center">
            <GlassPanel className="w-full max-w-md p-4 sm:p-5" glow="warm">
              {data.candles.length === 0 ? (
                <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <AxeBreatheLoader
                    label={
                      data.failure === "broker_symbol_not_found"
                        ? "Mapping symbol"
                        : data.failure === "market_data_unavailable"
                          ? "Checking market data"
                          : data.failure === "metaapi_timeout"
                            ? "MetaAPI timed out"
                          : "Checking broker data"
                    }
                    size="sm"
                  />
                </div>
              ) : null}
              <p className="text-sm font-semibold text-tos-text">{failureCopy.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-tos-muted">{failureCopy.body}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {data.failure === "account_not_connected" || data.failure === "provider_not_configured" ? (
                  <Link
                    href="/accounts"
                    className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 font-semibold text-white/90 hover:bg-white/[0.08]"
                  >
                    Connect account
                  </Link>
                ) : (
                  <Link
                    href="/accounts"
                    className="rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 font-semibold text-white/90 hover:bg-white/[0.08]"
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

        {/* Floating reset button removed — chart reset accessible via
            long-press or indicator tool rail instead. */}

        {/* Floating toast: lives INSIDE the chart frame so it can never push the
            indicator panes or the execution bar around. pointer-events:none so
            it doesn't steal chart pan/zoom. */}
        {snapshotMessage ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 max-w-[68%] rounded-lg border border-white/10 bg-black/76 px-2.5 py-1 text-[11px] font-medium text-tos-muted shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
            {snapshotMessage}
          </div>
        ) : null}

        {isTimeframePending ? (
          <div className="pointer-events-none absolute right-3 top-12 z-30 rounded-full border border-white/[0.08] bg-black/78 px-2.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
            <AxeBreatheLoader
              label={`Running ${CHART_TF_OPTIONS.find((t) => t.key === pendingTfKey)?.label ?? "TF"}`}
              size="sm"
            />
          </div>
        ) : null}
        {routeFallbackMessage ? (
          <div className="pointer-events-none absolute right-3 top-12 z-30 max-w-[18rem] rounded-xl border border-amber-300/20 bg-black/82 px-3 py-2 text-[10.5px] font-medium leading-snug text-amber-100/90 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
            {routeFallbackMessage}
          </div>
        ) : null}
        {(liveStatus === "stale" || liveStatus === "offline") && data.candles.length > 0 ? (
          <div className="pointer-events-none absolute left-3 top-12 z-30 max-w-[18rem] rounded-xl border border-white/10 bg-black/82 px-3 py-2 text-[10.5px] leading-snug text-tos-muted shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
            <p className="font-semibold text-tos-text/90">
              {liveStatus === "offline" ? "Using cached broker chart" : "Recovering live broker feed"}
            </p>
            <p className="mt-0.5">
              Showing the last stable broker candles
              {liveAge ? ` from ${liveAge}` : ""}.{" "}
              {liveReason ?? "AXE is keeping the chart responsive while the realtime path reconnects."}
              {reconnectAttempt > 0 ? ` Attempt ${reconnectAttempt}.` : ""}
            </p>
          </div>
        ) : null}
        {data.hint && !failureCopy && liveStatus !== "stale" && liveStatus !== "offline" ? (
          <div className="pointer-events-none absolute left-3 top-12 z-30 max-w-[18rem] rounded-xl border border-white/[0.06] bg-black/76 px-3 py-2 text-[10.5px] leading-snug text-white/82 shadow-[0_10px_30px_rgba(0,0,0,0.42)] backdrop-blur">
            {data.hint}
          </div>
        ) : null}
      </div>

      {/* Indicator panes: each one is its own bounded box, so the chart can
          never bleed into the volume/RSI area and vice versa. They share the
          main chart's time scale via canvasRef.timeToCoordinate(...). */}
      {indicatorToolFlags.volume ? (
        <ResizablePane
          height={paneHeights.volume}
          onResize={(next) => setPaneHeight("volume", next)}
          minHeight={70}
          maxHeight={260}
          ariaLabel="Resize volume pane"
        >
          <IndicatorPane mode="volume" candles={liveCandles} canvasRef={canvasRef} />
        </ResizablePane>
      ) : null}
      {indicatorToolFlags.rsi ? (
        <ResizablePane
          height={paneHeights.rsi}
          onResize={(next) => setPaneHeight("rsi", next)}
          minHeight={70}
          maxHeight={280}
          ariaLabel="Resize RSI pane"
        >
          <IndicatorPane mode="rsi" candles={liveCandles} canvasRef={canvasRef} />
        </ResizablePane>
      ) : null}
      {indicatorToolFlags.macd ? (
        <ResizablePane
          height={paneHeights.macd}
          onResize={(next) => setPaneHeight("macd", next)}
          minHeight={70}
          maxHeight={280}
          ariaLabel="Resize MACD pane"
        >
          <IndicatorPane mode="macd" candles={liveCandles} canvasRef={canvasRef} />
        </ResizablePane>
      ) : null}

      {/* Execution bar — hidden by default, shown when ⚡ 1-Click is active
          or a pending order is being placed. */}
      {oneClickVisible ? (
      <div className="shrink-0 border-t border-white/[0.08] bg-[var(--tos-bg-base)]/90 px-1.5 py-1 backdrop-blur-2xl">
        <div>
        {/* Row 1: compact SELL / Lots / BUY strip */}
        <div className="flex h-9 items-stretch gap-0.5">
          <button
            type="button"
            className={`flex min-w-0 flex-1 items-center justify-between rounded-[0.9rem] px-2 text-left transition-shadow ${
              executionMode === "market" && pendingOrderSide === "sell"
                ? "bg-gradient-to-r from-[#3A0710] via-[#9C1A26] to-[#E13947] text-white shadow-[inset_0_0_24px_rgba(225,57,71,0.32)]"
                : "bg-gradient-to-r from-[#1A0408] via-[#4A0C13] to-[#7A1722] text-white/85"
            }`}
            onClick={() => {
              setPendingOrderSide("sell");
              setExecutionMode("market");
              setPendingOrderType("market");
              setPendingOrderVisible(false);
              handleSendCurrentPlan({ side: "sell", orderType: "market", entryPrice: null });
            }}
            aria-label="Sell market"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide">Sell</span>
            <span className="font-mono text-[13px] font-bold leading-none">{lastPriceText}</span>
          </button>
          <button
            type="button"
            className="flex min-w-[3.5rem] flex-col items-center justify-center rounded-[0.9rem] border border-white/[0.08] bg-[#08080a]/80 px-1.5 text-[10px] font-semibold text-tos-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            onClick={() => setLotMenuOpen((v) => !v)}
            aria-label="Choose lot size"
          >
            <span className="font-mono text-[11px] font-semibold">{tradeVolume}</span>
          </button>
          <button
            type="button"
            className={`flex min-w-0 flex-1 items-center justify-between rounded-[0.9rem] px-2 text-left transition-shadow ${
              executionMode === "market" && pendingOrderSide === "buy"
                ? "bg-gradient-to-r from-[#063D44] via-[#0F94A5] to-[#22D3EE] text-white shadow-[inset_0_0_24px_rgba(255,255,255,0.32)]"
                : "bg-gradient-to-r from-[#03252A] via-[#0A5662] to-[#11808D] text-white/85"
            }`}
            onClick={() => {
              setPendingOrderSide("buy");
              setExecutionMode("market");
              setPendingOrderType("market");
              setPendingOrderVisible(false);
              handleSendCurrentPlan({ side: "buy", orderType: "market", entryPrice: null });
            }}
            aria-label="Buy market"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide">Buy</span>
            <span className="font-mono text-[13px] font-bold leading-none">{lastPriceText}</span>
          </button>
        </div>

        {/* Order-type chip row. Selecting a pending type opens the
            dedicated pending row; selecting Market hides it. */}
        <div className="mt-0.5 flex h-7 items-stretch gap-0.5">
          <button
            type="button"
            onClick={() => setOrderTypeMenuOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-[0.7rem] border border-white/[0.08] bg-[#0e0f12] px-2 text-left text-[10px] font-semibold text-tos-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            aria-label="Choose execution type"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-white/80">
              <ChevronDown className="h-3 w-3" />
            </span>
            <span className="truncate uppercase tracking-wide text-tos-text">
              {executionMode === "market" ? "Market execution" : orderTypeLabel(pendingOrderType)}
            </span>
            <span className="ml-auto font-mono text-[11px] text-tos-muted">
              {executionMode === "pending" && pendingOrderPrice != null
                ? formatBrokerPrice(data.brokerSymbol, pendingOrderPrice)
                : tradeVolume}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDeviationPoints((v) => (v >= 100 ? 1 : v + 5))}
            className="flex min-w-[2.8rem] items-center justify-center gap-0.5 rounded-[0.7rem] border border-white/[0.08] bg-black/45 px-1.5 text-[8px] font-bold uppercase tracking-wider text-tos-muted hover:bg-white/[0.04]"
            aria-label="Cycle slippage / deviation"
            title="Slippage / Deviation in points"
          >
            <span>DEV</span>
            <span className="font-mono text-[10px] text-tos-text">{deviationPoints}</span>
          </button>
        </div>

        {/* Row 2: pending-only ticket. This is the only place pending
            Limit/Stop orders can be submitted. */}
        {executionMode === "pending" ? (
        <div className="mt-0.5 flex h-7 items-stretch gap-0.5">
          <div className={`flex min-w-[4.2rem] items-center justify-center rounded-[0.7rem] border px-1.5 text-[9px] font-bold uppercase tracking-wide ${
            pendingOrderSide === "buy"
              ? "border-white/[0.12] bg-white/[0.06] text-white"
              : "border-rose-300/35 bg-rose-400/12 text-rose-100"
          }`}>
            {orderTypeLabel(pendingOrderType)}
          </div>
          <button
            type="button"
            onClick={() => {
              const entry = pendingOrderPrice ?? livePrice ?? data.lastPrice;
              if (entry == null || !Number.isFinite(entry)) return;
              const distance = draggablePlanDistance(data.candles, entry);
              setPendingStopLossPrice((prev) =>
                prev == null ? (pendingOrderSide === "buy" ? entry - distance : entry + distance) : null,
              );
              setPendingOrderVisible(true);
            }}
            className={`flex min-w-[2.75rem] items-center justify-center gap-1 rounded-[1.05rem] px-2 text-[10px] font-bold uppercase tracking-wider ${
              pendingStopLossPrice != null
                ? "border border-rose-500/60 bg-rose-500/15 text-rose-200/95"
                : "border border-white/[0.08] bg-black/45 text-rose-300/85 hover:bg-rose-500/8"
            }`}
            aria-label="Set stop loss"
          >
            SL
          </button>
          <button
            type="button"
            onClick={() => {
              const entry = pendingOrderPrice ?? livePrice ?? data.lastPrice;
              if (entry == null || !Number.isFinite(entry)) return;
              const distance = draggablePlanDistance(data.candles, entry);
              setPendingTakeProfitPrice((prev) =>
                prev == null ? (pendingOrderSide === "buy" ? entry + distance * 1.6 : entry - distance * 1.6) : null,
              );
              setPendingOrderVisible(true);
            }}
            className={`flex min-w-[2.75rem] items-center justify-center gap-1 rounded-[1.05rem] px-2 text-[10px] font-bold uppercase tracking-wider ${
              pendingTakeProfitPrice != null
                ? "border border-emerald-400/60 bg-emerald-400/15 text-emerald-200/95"
                : "border border-white/[0.08] bg-black/45 text-emerald-300/85 hover:bg-emerald-400/8"
            }`}
            aria-label="Set take profit"
          >
            TP
          </button>
          <button
            type="button"
            onClick={() => handleSendCurrentPlan()}
            className="flex min-w-[4.15rem] items-center justify-center rounded-[1.05rem] border border-amber-300/55 bg-amber-400/18 px-2 text-[10px] font-black uppercase tracking-wider text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.12)] hover:bg-amber-400/25"
            aria-label={`Set pending ${orderTypeLabel(pendingOrderType)}`}
          >
            Set ▶
          </button>
        </div>
        ) : null}
        </div>
      </div>
      ) : null}

      {/* Order-type chooser popover */}
      {orderTypeMenuOpen ? (
        <div
          className="absolute inset-x-2 bottom-[6.5rem] z-40 rounded-2xl border border-white/10 bg-[#060c14]/97 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur"
          style={{ paddingBottom: "0.75rem" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-tos-dim">Execution type</p>
            <button
              type="button"
              onClick={() => setOrderTypeMenuOpen(false)}
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-tos-muted"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: "market", label: "Market execution" },
              { id: "buy_limit", label: "Buy Limit" },
              { id: "sell_limit", label: "Sell Limit" },
              { id: "buy_stop", label: "Buy Stop" },
              { id: "sell_stop", label: "Sell Stop" },
            ] as const).map((opt) => {
              const isActive = pendingOrderType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPendingOrderType(opt.id);
                    if (opt.id !== "market") {
                      const sideForType = opt.id.startsWith("buy") ? "buy" : "sell";
                      showPendingTradePlan(sideForType, opt.id);
                    } else {
                      setExecutionMode("market");
                      setPendingOrderVisible(false);
                    }
                    setOrderTypeMenuOpen(false);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-[12px] font-semibold ${
                    isActive
                      ? "border-white/[0.14] bg-white/[0.06] text-white"
                      : "border-white/10 bg-white/[0.03] text-tos-text hover:bg-white/[0.06]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
            Market uses the red/cyan MKT tickets immediately. Pending types draw a movable plan line —
            drag entry/SL/TP, then press the gold Set ▶ button.
          </p>
        </div>
      ) : null}

      {/* Lot quick picker — same UX as MT5 mobile */}
      {lotMenuOpen ? (
        <div
          className="absolute inset-x-2 bottom-[6.5rem] z-40 rounded-2xl border border-white/10 bg-[#060c14]/97 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur"
          style={{ paddingBottom: "0.75rem" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-tos-dim">Lots</p>
            <button
              type="button"
              onClick={() => setLotMenuOpen(false)}
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-tos-muted"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2].map((v) => {
              const txt = v < 1 ? v.toFixed(2) : v.toFixed(1).replace(/\.0$/, "");
              const isActive = parseFloat(tradeVolume) === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setTradeVolume(txt);
                    setLotMenuOpen(false);
                  }}
                  className={`rounded-lg border px-2 py-2 text-center font-mono text-[12px] font-bold ${
                    isActive
                      ? "border-white/[0.14] bg-white/[0.06] text-white"
                      : "border-white/10 bg-white/[0.03] text-tos-text hover:bg-white/[0.06]"
                  }`}
                >
                  {txt}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[0.01, 0.1, 1].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  const cur = parseFloat(tradeVolume) || 0;
                  const next = Math.max(0.01, +(cur + step).toFixed(2));
                  setTradeVolume(next < 1 ? next.toFixed(2) : next.toFixed(1).replace(/\.0$/, ""));
                }}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-1.5 text-[11px] font-bold text-white/90"
              >
                <Plus className="h-3 w-3" />
                {step}
              </button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {[0.01, 0.1, 1].map((step) => (
              <button
                key={`m-${step}`}
                type="button"
                onClick={() => {
                  const cur = parseFloat(tradeVolume) || 0;
                  const next = Math.max(0.01, +(cur - step).toFixed(2));
                  setTradeVolume(next < 1 ? next.toFixed(2) : next.toFixed(1).replace(/\.0$/, ""));
                }}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1.5 text-[11px] font-bold text-tos-muted"
              >
                <Minus className="h-3 w-3" />
                {step}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Slide-out drawers: anchored to the top of the chart frame so the
          chart canvas itself never reflows when the trader toggles them.
          Both panels close each other so only one is visible at a time. */}
      <ChartOrderBookDrawer
        open={orderBookOpen}
        onClose={() => setOrderBookOpen(false)}
        symbol={data.brokerSymbol}
        digits={priceDigitsForSymbol(data.brokerSymbol)}
        livePrice={livePrice}
        bid={liveBid}
        ask={liveAsk}
      />

      <ChartNewsDrawer
        open={newsOpen}
        onClose={() => setNewsOpen(false)}
        symbol={data.symbol}
      />

      {/* Standalone alert fired toast */}
      {firedAlert ? (
        <div
          className="pointer-events-auto absolute left-1/2 top-16 z-50 flex max-w-[88%] -translate-x-1/2 items-center gap-2 rounded-xl border border-white/[0.14] bg-[#031418]/95 px-3 py-2 text-[11px] text-white shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur"
          role="status"
        >
          <Bell className="h-4 w-4 text-emerald-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Alert · {firedAlert.message}</p>
            <p className="text-[10px] text-white/50">
              {firedAlert.pushed ? "Push delivered" : "Delivered in-app"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFiredAlert(null)}
            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-tos-muted"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Trade toast — demo / live confirm + soft errors */}
      {tradeToast ? (
        <div
          className={`pointer-events-auto absolute left-1/2 bottom-[8.5rem] z-[60] flex max-w-[88%] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2 text-[11px] shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur ${
            tradeToast.kind === "demo"
              ? "border-white/[0.12] bg-white/[0.05] text-white"
              : tradeToast.kind === "live"
                ? "border-emerald-200/55 bg-emerald-300/14 text-white/90"
                : tradeToast.kind === "error"
                  ? "border-rose-400/45 bg-rose-400/12 text-rose-100"
                  : "border-amber-400/35 bg-amber-400/8 text-amber-100"
          }`}
          role="status"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{tradeToast.title}</p>
            {tradeToast.body ? (
              <p className="mt-0.5 text-[10.5px] opacity-85">{tradeToast.body}</p>
            ) : null}
          </div>
          {tradeToast.kind === "info" ? (
            <Link
              href="/settings"
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold"
              onClick={() => setTradeToast(null)}
            >
              Settings
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setTradeToast(null)}
            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold opacity-90"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Demo positions chip — visible only on demo, only when there's
          something to track. Tap → close all (paper). */}
      {isDemoAccount && demoBook.forSymbol.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            // Close most-recent demo position to keep the gesture simple.
            const newest = demoBook.forSymbol[0];
            if (newest) demoBook.close(newest.id);
          }}
          className="absolute left-1/2 top-12 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#031418]/92 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur hover:bg-emerald-300/12"
          aria-label="Close most recent demo position"
        >
          <span className="rounded-full bg-white/[0.10] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/90">
            DEMO
          </span>
          <span>
            {demoBook.forSymbol.length} open ·{" "}
            <span
              className={`font-mono ${
                demoBook.pnlOnSymbol >= 0 ? "text-white/80" : "text-rose-300"
              }`}
            >
              {demoBook.pnlOnSymbol >= 0 ? "+" : ""}
              {demoBook.pnlOnSymbol.toFixed(2)} $
            </span>
          </span>
          <span className="text-[9px] text-white/50">tap to close</span>
        </button>
      ) : null}

      {/* Final-confirm modal for live broker orders */}
      <ChartOrderConfirm
        open={orderConfirmInput != null}
        input={orderConfirmInput}
        status={orderConfirmStatus}
        onCancel={() => {
          setOrderConfirmInput(null);
          setOrderConfirmStatus({ kind: "idle" });
        }}
        onConfirm={sendLiveConfirmedOrder}
      />

    </div>
  );
}

function orderTypeLabel(t: "market" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop"): string {
  switch (t) {
    case "market":
      return "Market";
    case "buy_limit":
      return "Buy Limit";
    case "sell_limit":
      return "Sell Limit";
    case "buy_stop":
      return "Buy Stop";
    case "sell_stop":
      return "Sell Stop";
  }
}
