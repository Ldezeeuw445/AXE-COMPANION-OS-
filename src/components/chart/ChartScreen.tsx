"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Clock3,
  Info,
  Landmark,
  Layers,
  LineChart,
  MessageSquare,
  RotateCcw,
  Save,
  Sparkles,
  Spline,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { formatBrokerPrice, priceDigitsForSymbol } from "@/lib/broker/symbolFormat";
import type { ChartOverlayRow, ChartPageData } from "@/lib/broker/loadChartPageData";
import { AxeChartActionBus } from "@/lib/axeChartActions/chartActionBus";
import { buildFibonacciActionFromCandles } from "@/lib/axeChartActions/swingAnalysis";
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
import { ChartExecutionBridge } from "@/components/chart/ChartExecutionBridge";

const TICK_REACT_THROTTLE_MS = 150;
const SNAPSHOT_INTERVAL_MS = 30_000;

const CHART_SCALE_MODES = [
  { id: "near", label: "Close view" },
  { id: "mid", label: "Mid view" },
  { id: "far", label: "Wide view" },
] as const;

type Props = {
  data: ChartPageData;
  initialAction?: string;
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

function sessionCopy(now = new Date()): string {
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sessions: string[] = [];
  if (utcHour >= 0 && utcHour < 8) sessions.push("Asia");
  if (utcHour >= 7 && utcHour < 16) sessions.push("London");
  if (utcHour >= 12 && utcHour < 21) sessions.push("NY");
  return sessions.length ? sessions.join(" + ") : "After-hours";
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

function TradePlanLine({
  canvasRef,
  price,
  label,
  color,
  digits,
  onChange,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  price: number | null;
  label: string;
  color: string;
  digits: number;
  onChange: (price: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
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
    const compute = () => setY(price == null ? null : handle.priceToCoordinate(price));
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
        <line x1={0} x2={size.w} y1={y} y2={y} stroke={color} strokeWidth={1} />
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
          <rect x={0} y={y - 18} width={size.w} height={36} fill="transparent" />
          <rect x={6} y={y - 16} width={116} height={24} rx={4} fill="rgba(0,0,0,0.76)" stroke={color} />
          <text x={14} y={y} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={11} fontWeight={700} fill={color}>
            {label}
          </text>
          <circle cx={132} cy={y - 4} r={8} fill={color} stroke="rgba(255,255,255,0.86)" strokeWidth={1.5} />
          <rect x={size.w - 74} y={y - 15} width={68} height={24} rx={3} fill="rgba(0,0,0,0.72)" stroke={color} />
          <text x={size.w - 40} y={y + 1} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={12} fontWeight={700} fill={color}>
            {price.toFixed(digits)}
          </text>
        </g>
      </svg>
    </div>
  );
}

export function ChartScreen({ data, initialAction }: Props) {
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
  const [annotationsLoadedKey, setAnnotationsLoadedKey] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const drawingPointsRef = useRef<AnnotationPoint[]>([]);
  const [drawingHint, setDrawingHint] = useState<string | null>(null);
  const [executionBridgeOpen, setExecutionBridgeOpen] = useState<boolean>(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [scaleModeIndex, setScaleModeIndex] = useState(0);
  const [toolRailOpen, setToolRailOpen] = useState(false);
  const [activeToolFlags, setActiveToolFlags] = useState<Record<string, boolean>>({});
  const [pendingOrderSide, setPendingOrderSide] = useState<"buy" | "sell">("buy");
  const [pendingOrderPrice, setPendingOrderPrice] = useState<number | null>(data.lastPrice);
  const [pendingStopLossPrice, setPendingStopLossPrice] = useState<number | null>(null);
  const [pendingTakeProfitPrice, setPendingTakeProfitPrice] = useState<number | null>(null);
  const [pendingOrderVisible, setPendingOrderVisible] = useState(false);
  const [tradeVolume] = useState("0.10");

  const showPendingTradePlan = useCallback(
    (side: "buy" | "sell") => {
      const entry = pendingOrderPrice ?? livePrice ?? data.lastPrice;
      const distance = draggablePlanDistance(data.candles, entry);
      setPendingOrderSide(side);
      setPendingOrderVisible(true);
      if (entry != null && Number.isFinite(entry)) {
        const sideChanged = side !== pendingOrderSide;
        setPendingOrderPrice(entry);
        setPendingStopLossPrice((prev) => (prev != null && !sideChanged ? prev : side === "buy" ? entry - distance : entry + distance));
        setPendingTakeProfitPrice((prev) =>
          prev != null && !sideChanged ? prev : side === "buy" ? entry + distance * 1.6 : entry - distance * 1.6,
        );
      }
      setExecutionBridgeOpen(true);
    },
    [data.candles, data.lastPrice, livePrice, pendingOrderPrice, pendingOrderSide],
  );

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
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

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
      if (Number.isFinite(candle.close) && Date.now() - lastReactPriceAt.current > 1_500) {
        setLivePrice(candle.close);
      }
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

  const removeLastAnnotation = useCallback(() => {
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      saveAnnotations(data.symbol, data.timeframeKey, next);
      return next;
    });
  }, [data.symbol, data.timeframeKey]);

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
            const annotation: ChartAnnotation = {
              id: cmd.id,
              accountId: cmd.accountId ?? null,
              symbol: cmd.symbol,
              timeframe: cmd.timeframe,
              type: "trendline",
              points: points.slice(0, 2) as AnnotationPoint[],
              settings: { source: cmd.source },
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
          const command = buildFibonacciActionFromCandles({
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
            message: "AXE could not find a clean recent swing. Use manual Fibonacci and tap two anchors.",
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
    [accountId, data.candles, data.symbol, data.timeframeKey, executeChartAction],
  );

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
    tfLabel,
    overlays.length,
    accountLabel,
    executionBridgeOpen,
    saveSnapshotToVault,
    focusDataDetails,
  ]);

  // Inject the LIVE pill (center) and AXE button (right) into the global mobile top bar.
  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    setCenter(
      <button
        type="button"
        onClick={() => showPendingTradePlan(pendingOrderSide)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/20 bg-white/[0.03] text-cyan-300/90"
        aria-label="Open limit controls"
      >
        <Clock3 className="h-4 w-4" />
      </button>,
    );
    setRight(
      <div className="flex flex-col items-end gap-1">
        <AxeContextToolbar title="Chart" subtitle={`${data.symbol} · ${tfLabel}`} sections={toolbarSections} />
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-200/95">
          <span className={`h-1.5 w-1.5 rounded-full ${statusPill.dot}`} aria-hidden />
          LIVE
        </div>
      </div>,
    );
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [setCenter, setRight, data.symbol, tfLabel, toolbarSections, pendingOrderSide, showPendingTradePlan, statusPill.dot]);

  return (
    <div className="flex h-[calc(100dvh-3.25rem-env(safe-area-inset-bottom))] min-h-0 flex-1 flex-col overflow-hidden md:h-auto md:overflow-visible">
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
        <div className="mt-2 hidden items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-3 py-2 text-[11px] text-cyan-100/95 md:flex">
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
        className="relative -mx-4 mt-0 min-h-0 flex-1 overflow-hidden border-y border-white/[0.08] md:mx-0 md:min-h-[520px] md:rounded-none md:border-x"
        style={{ background: CHART_THEME.background }}
      >
        <ChartCanvas
          ref={canvasRef}
          candles={data.candles}
          overlays={overlays}
          symbol={data.brokerSymbol}
          annotations={annotations}
          drawingMode={drawingMode}
          navigationLocked={pendingOrderVisible}
          onPointClick={handlePointClick}
        />

        <ChartIndicatorLayer
          candles={data.candles}
          canvasRef={canvasRef}
          active={{
            volume: activeToolFlags.volume,
            rsi: activeToolFlags.rsi,
            ma: activeToolFlags.ma,
            structure: activeToolFlags.structure,
            orderBlocks: activeToolFlags.orderBlocks,
          }}
        />

        {pendingOrderVisible ? (
          <>
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingOrderPrice}
              label={`${pendingOrderSide.toUpperCase()} LIMIT`}
              color={pendingOrderSide === "buy" ? "#1f8cff" : "#ef4444"}
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={setPendingOrderPrice}
            />
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingStopLossPrice}
              label="SL"
              color="#c95450"
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={setPendingStopLossPrice}
            />
            <TradePlanLine
              canvasRef={canvasRef}
              price={pendingTakeProfitPrice}
              label="TP"
              color="#1f9c7b"
              digits={priceDigitsForSymbol(data.brokerSymbol)}
              onChange={setPendingTakeProfitPrice}
            />
          </>
        ) : null}

        <div className="absolute left-0 right-0 top-0 z-30 border-b border-white/[0.07] bg-black/68 px-2 py-1.5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <select
                  value={data.symbol}
                  onChange={(e) => goSymbol(e.target.value)}
                  className="min-w-0 max-w-[7.5rem] appearance-none bg-transparent font-mono text-[13px] font-bold uppercase tracking-tight text-[#1f8cff] outline-none"
                  aria-label="Symbol"
                >
                  {data.symbolOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={data.timeframeKey}
                  onChange={(e) => goTf(e.target.value)}
                  className="appearance-none bg-transparent font-mono text-[13px] font-semibold uppercase text-tos-text outline-none"
                  aria-label="Timeframe"
                >
                  {CHART_TF_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-tos-text/82">{lastPriceText}</p>
            </div>
            <div className="pt-0.5 text-right text-[9px] font-semibold uppercase tracking-[0.16em] text-tos-dim">
              {sessionCopy()}
            </div>
          </div>
        </div>

        {!toolRailOpen ? (
          <button
            type="button"
            onClick={() => setToolRailOpen(true)}
            className="absolute left-0 top-1/2 z-30 grid h-12 w-5 -translate-y-1/2 place-items-center rounded-r-full border border-l-0 border-white/10 bg-black/78 text-cyan-200 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur"
            aria-label="Open drawing toolbar"
          >
            <ChevronDown className="-rotate-90 h-4 w-4" aria-hidden />
          </button>
        ) : null}

        <div
          className={`absolute left-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-r-full border border-l-0 border-white/10 bg-black/78 p-1 backdrop-blur transition-transform ${
            toolRailOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setToolRailOpen((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-cyan-200"
            aria-label="Toggle drawing toolbar"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${toolRailOpen ? "rotate-90" : "-rotate-90"}`} />
          </button>
          {[
            { id: "axe", label: "AXE", icon: MessageSquare, action: () => router.push(chatQ(`[AXE · chart ${data.symbol} ${tfLabel}]\nRead this chart and tell me what matters now.`)) },
            { id: "fib", label: "Auto Fib", icon: Spline, action: () => executeActionByType("draw_fibonacci", "user") },
            { id: "orderBlocks", label: "OB", icon: Layers, action: () => toggleToolFlag("orderBlocks") },
            { id: "vol", label: "Vol", icon: BarChart3, action: () => toggleToolFlag("volume") },
            { id: "rsi", label: "RSI", icon: Activity, action: () => toggleToolFlag("rsi") },
            { id: "ma", label: "MA", icon: LineChart, action: () => toggleToolFlag("ma") },
            { id: "structure", label: "Structure", icon: Sparkles, action: () => toggleToolFlag("structure") },
          ].map((item) => {
            const Icon = item.icon;
            const active = Boolean(activeToolFlags[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                title={item.label}
                className={`grid h-8 w-8 place-items-center rounded-full border text-[10px] transition ${
                  active
                    ? "border-cyan-300/45 bg-cyan-400/18 text-cyan-100"
                    : "border-white/[0.06] bg-white/[0.035] text-tos-muted hover:text-cyan-100"
                }`}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>

        {/* Drawing overlays: must NOT steal chart pan/zoom except on handles */}
        <div className="pointer-events-none absolute inset-0 z-[25]">
          <FibAnnotationLayer
            annotations={annotations}
            canvasRef={canvasRef}
            digits={priceDigitsForSymbol(data.brokerSymbol)}
            onUpdate={updateAnnotation}
            onRemove={removeAnnotationById}
          />

          {/* Interactive Trendline layer — draggable endpoints */}
          <TrendlineAnnotationLayer
            annotations={annotations}
            canvasRef={canvasRef}
            onUpdate={updateAnnotation}
            onRemove={removeAnnotationById}
          />
        </div>

        {Object.entries(activeToolFlags).some(([, active]) => active) ? (
          <div className="pointer-events-none absolute bottom-[4.75rem] left-3 z-20 flex max-w-[70%] flex-wrap gap-1">
            {Object.entries(activeToolFlags)
              .filter(([, active]) => active)
              .map(([id]) => (
                <span
                  key={id}
                  className="rounded border border-cyan-400/20 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/85 backdrop-blur"
                >
                  {id}
                </span>
              ))}
          </div>
        ) : null}

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

        <button
          type="button"
          onClick={resetChartView}
          className="absolute bottom-3 right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/76 text-cyan-100/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-cyan-300/45 hover:bg-cyan-400/12 active:scale-95"
          aria-label={CHART_SCALE_MODES[scaleModeIndex].label}
          title={CHART_SCALE_MODES[scaleModeIndex].label}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {executionBridgeOpen ? (
        <ChartExecutionBridge
          symbol={data.symbol}
          brokerSymbol={data.brokerSymbol}
          timeframeLabel={tfLabel}
          lastPrice={livePrice}
          digits={priceDigitsForSymbol(data.brokerSymbol)}
          defaultSide={pendingOrderSide}
          defaultOrderType="limit"
          defaultVolume={tradeVolume}
          entryPrice={pendingOrderPrice}
          stopLossPrice={pendingStopLossPrice}
          takeProfitPrice={pendingTakeProfitPrice}
          onClose={() => setExecutionBridgeOpen(false)}
        />
      ) : null}

      <div className="-mx-4 shrink-0 border-t border-white/[0.08] bg-black/96 backdrop-blur md:mx-0">
        <div className="flex h-14 items-stretch gap-px">
          <button
            type="button"
            className={`flex min-w-0 flex-1 items-center justify-between px-3 text-left ${
              pendingOrderSide === "sell"
                ? "bg-gradient-to-r from-[#3A090E] via-[#7D1D28] to-[#B93147] text-white"
                : "bg-white/[0.03] text-tos-muted"
            }`}
            onClick={() => showPendingTradePlan("sell")}
          >
            <span className="text-[10px] font-semibold uppercase">Sell</span>
            <span className="font-mono text-[17px] font-bold leading-none">{lastPriceText}</span>
          </button>
          <button
            type="button"
            className="flex min-w-[7.5rem] flex-col items-center justify-center bg-black px-2 text-[11px] font-semibold text-tos-text"
            onClick={() => {
              if (!pendingOrderVisible) {
                showPendingTradePlan(pendingOrderSide);
                return;
              }
              setExecutionBridgeOpen((v) => !v);
            }}
          >
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase text-tos-muted">
              Limit
            </span>
            <span className="font-mono text-[12px]">{tradeVolume} lots</span>
          </button>
          <button
            type="button"
            className={`flex min-w-0 flex-1 items-center justify-between px-3 text-left ${
              pendingOrderSide === "buy"
                ? "bg-gradient-to-r from-[#0E3850] via-[#148FC3] to-[#18B6EC] text-white"
                : "bg-white/[0.03] text-tos-muted"
            }`}
            onClick={() => showPendingTradePlan("buy")}
          >
            <span className="text-[10px] font-semibold uppercase">Buy</span>
            <span className="font-mono text-[17px] font-bold leading-none">{lastPriceText}</span>
          </button>
        </div>
      </div>

      {snapshotMessage ? (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-tos-muted">
          {snapshotMessage}
        </p>
      ) : null}

      <div className="hidden md:block">
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
    </div>
  );
}
