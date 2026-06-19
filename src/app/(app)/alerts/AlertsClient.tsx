"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Loader2, Pause, Play, Plus, Shield, Trash2, Zap } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import { Badge } from "@/components/ui/Badge";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { PushPermission } from "@/components/push/PushPermission";
import { setLiveStatus, clearLiveStatusScope } from "@/lib/liveStatusBus";
import { chatHrefWithPrefill, stageChatPrefill } from "@/lib/chat/chatPrefill";
import {
  parseOptionalPrice,
  readAlertStopsFromMetadata,
  readTradeSideFromMetadata,
  slTpHints,
  suggestAlertStopsFromOffsets,
  validateAlertTradeStops,
  type AlertTradeSide,
} from "@/lib/trading/alertTradeStops";
import type { TradeExecutionPrefs } from "@/lib/trading/tradeExecutionPrefs";
import { readAlertAutoTradeEnabled } from "@/lib/trading/alertMetadata";
import { alertAutoTradeArmedRemainingMs } from "@/lib/trading/alertAutoTradeArmed";

type AlertRow = {
  id: string;
  symbol: string | null;
  type: string;
  condition: string | null;
  threshold: number | null;
  keyword: string | null;
  status: "active" | "paused" | string;
  triggered_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type PushStatus = {
  vapidConfigured: boolean;
  hasSubscription: boolean;
};

type AlertRuntimeCheck = {
  state: "checking" | "valid" | "degraded" | "unavailable" | "inactive";
  brokerSymbol: string | null;
  reason: string;
};

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

function deliveryNoteForType(type: string): string {
  switch (type) {
    case "price":
      return "Live on Chart when this symbol is active";
    case "position_risk":
      return "Saved — position monitor evaluator coming soon";
    case "news":
    case "macro":
      return "Saved — intel feed hook coming soon";
    case "journal_reminder":
      return "Reminder only — no auto-fire yet";
    default:
      return "In-app only";
  }
}

function humanAlertType(type: string): string {
  switch (type) {
    case "price":
      return "Price";
    case "position_risk":
      return "Position risk";
    case "news":
      return "News";
    case "macro":
      return "Macro";
    case "journal_reminder":
      return "Journal reminder";
    default:
      return type.replace(/_/g, " ");
  }
}
function badgeVariantForType(type: string): "price" | "news" | "risk" | "warm" | "neutral" {
  if (type === "price") return "price";
  if (type === "news") return "news";
  if (type === "position_risk") return "risk";
  if (type === "macro") return "warm";
  return "neutral";
}

type DeliveryDescriptor = {
  /** Long form for desktop / inline display. */
  label: string;
  /** Short form for the mobile top-bar (must fit beside AXE wordmark). */
  short: string;
  className: string;
  dot: string;
};

function deliveryPill(status: PushStatus | null): DeliveryDescriptor {
  // AXE Companion alerts are evaluated in-app: the chart screen watches live
  // ticks and trips alerts even when web-push is unavailable. So the default
  // "delivery" status is in-app-on-this-device, and push (if configured) is
  // an additional channel — never a hard requirement.
  if (!status) {
    return {
      label: "Delivery: in-app",
      short: "In-app",
      className: "border-white/[0.08] bg-white/[0.05] text-white/90",
      dot: "bg-white/60",
    };
  }
  if (status.vapidConfigured && status.hasSubscription) {
    return {
      label: "Delivery: push + in-app",
      short: "Push",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200/95",
      dot: "bg-emerald-300/85",
    };
  }
  if (status.vapidConfigured) {
    return {
      label: "Delivery: in-app · enable push",
      short: "In-app",
      className: "border-white/[0.08] bg-white/[0.05] text-white/90",
      dot: "bg-white/60",
    };
  }
  return {
    label: "Delivery: in-app",
    short: "In-app",
    className: "border-white/[0.08] bg-white/[0.05] text-white/90",
    dot: "bg-white/60",
  };
}

function priceAlertRuntimeOk(state: AlertRuntimeCheck["state"]): boolean {
  return state === "valid" || state === "degraded";
}

function buildAlertRefineDraft(args: {
  symbol: string;
  type: string;
  condition: string;
  tradeSide: string;
  threshold: string;
  keyword: string;
  defaultVolume: number;
  alertAutoTradeEnabled: boolean;
  stopLoss: string;
  takeProfit: string;
}): string {
  const sym = args.symbol.trim().toUpperCase() || "XAUUSD";
  return `[AXE · alerts]
Refine this alert rule for ${sym}:
- Type: ${args.type}
- Fires when price: ${args.condition === "below" ? "drops to" : "rises to"} ${args.threshold || "?"}
- Auto-trade direction: ${args.tradeSide.toUpperCase()}
- Entry price: ${args.threshold || "?"}
- Stop loss price: ${args.stopLoss || "?"}
- Take profit price: ${args.takeProfit || "?"}
- Keyword: ${args.keyword || "—"}
- My default size: ${args.defaultVolume.toFixed(2)} lots
- Alert auto-trade: ${args.alertAutoTradeEnabled ? "ON (market + SL/TP required)" : "OFF"}

Return one crisp alert I can save, with threshold, SL, TP prices, and a one-line rationale.`;
}

export function AlertsClient({
  initialSymbol,
  tradePrefs,
}: {
  initialSymbol: string;
  tradePrefs: TradeExecutionPrefs;
}) {
  const router = useRouter();
  const focusSymbol = initialSymbol.trim().toUpperCase();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [runtimeCheck, setRuntimeCheck] = useState<AlertRuntimeCheck>({
    state: "inactive",
    brokerSymbol: null,
    reason: "No symbol selected.",
  });

  const [formType, setFormType] = useState<string>("price");
  const [formSymbol, setFormSymbol] = useState<string>(focusSymbol || "");
  const [formCondition, setFormCondition] = useState<string>("below");
  const [formTradeSide, setFormTradeSide] = useState<AlertTradeSide>("buy");
  const [formThreshold, setFormThreshold] = useState<string>("");
  const [formStopLoss, setFormStopLoss] = useState<string>("");
  const [formTakeProfit, setFormTakeProfit] = useState<string>("");
  const [formKeyword, setFormKeyword] = useState<string>("");
  const [armed, setArmed] = useState(tradePrefs.alertAutoTradeArmed);
  const [armedAt, setArmedAt] = useState<string | null>(tradePrefs.alertAutoTradeArmedAt);
  const [armPending, setArmPending] = useState(false);
  const [armTick, setArmTick] = useState(0);
  const [stopsTouched, setStopsTouched] = useState(false);

  useEffect(() => {
    if (!focusSymbol) return;
    setFormSymbol(focusSymbol);
  }, [focusSymbol]);

  useEffect(() => {
    const symbol = formSymbol.trim().toUpperCase();
    if (!symbol) {
      setRuntimeCheck({ state: "inactive", brokerSymbol: null, reason: "No symbol selected." });
      return;
    }
    const ctrl = new AbortController();
    setRuntimeCheck((prev) => ({ ...prev, state: "checking", reason: "Checking active broker runtime." }));
    const timer = setTimeout(() => {
      void fetch(`/api/broker/symbol?symbol=${encodeURIComponent(symbol)}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Broker runtime unavailable");
          return (await res.json()) as {
            state: "valid" | "degraded" | "unavailable" | "inactive" | "warming";
            brokerSymbol?: string | null;
            reason?: string;
            freshness?: string | null;
          };
        })
        .then((runtime) => {
          setRuntimeCheck({
            state: runtime.state === "warming" ? "degraded" : runtime.state,
            brokerSymbol: runtime.brokerSymbol ?? null,
            reason: runtime.reason ?? "Broker runtime checked.",
          });
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            setRuntimeCheck({ state: "unavailable", brokerSymbol: null, reason: "Could not verify broker runtime for this symbol." });
          }
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [formSymbol]);

  useEffect(() => {
    if (formType !== "price" || stopsTouched) return;
    const threshold = parseOptionalPrice(formThreshold);
    if (threshold == null) return;
    const suggested = suggestAlertStopsFromOffsets(
      formTradeSide,
      threshold,
      tradePrefs.alertSlOffset,
      tradePrefs.alertTpOffset,
    );
    if (suggested.stopLoss != null) setFormStopLoss(String(suggested.stopLoss));
    if (suggested.takeProfit != null) setFormTakeProfit(String(suggested.takeProfit));
  }, [
    formType,
    formThreshold,
    formTradeSide,
    tradePrefs.alertSlOffset,
    tradePrefs.alertTpOffset,
    stopsTouched,
  ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertsRes, pushRes] = await Promise.all([
        fetch("/api/alerts", { credentials: "include" }),
        fetch("/api/push/status", { credentials: "include" }),
      ]);

      if (alertsRes.status === 401) {
        setError("Sign in to manage alerts.");
        setAlerts([]);
      } else if (!alertsRes.ok) {
        const j = (await alertsRes.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not load alerts.");
      } else {
        const j = (await alertsRes.json()) as { alerts: AlertRow[] };
        setAlerts(j.alerts ?? []);
      }

      if (pushRes.ok) {
        const pj = (await pushRes.json()) as PushStatus;
        setPush(pj);
      } else {
        setPush(null);
      }
    } catch {
      setError("Could not load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setArmTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [armed]);

  const armedRemainingMin = useMemo(() => {
    void armTick;
    if (!armedAt) return 0;
    return Math.ceil(alertAutoTradeArmedRemainingMs(armedAt) / 60_000);
  }, [armTick, armedAt]);

  useEffect(() => {
    if (!armed || !armedAt) return;
    if (alertAutoTradeArmedRemainingMs(armedAt) <= 0) setArmed(false);
  }, [armTick, armed, armedAt]);

  const setArmState = useCallback(async (nextArm: boolean) => {
    setArmPending(true);
    setError(null);
    try {
      const res = await fetch("/api/preferences/alert-armed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ arm: nextArm }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not update arm state.");
        return;
      }
      const json = (await res.json()) as { armed?: boolean; armedAt?: string | null };
      setArmed(Boolean(json.armed));
      setArmedAt(json.armedAt ?? null);
    } finally {
      setArmPending(false);
    }
  }, []);

  const toggleAlertAutoTrade = useCallback(
    async (alert: AlertRow, enabled: boolean) => {
      setError(null);
      const metadata = {
        ...(alert.metadata && typeof alert.metadata === "object" ? alert.metadata : {}),
        auto_trade_enabled: enabled,
      };
      const res = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ metadata }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not update alert.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const visibleAlerts = useMemo(() => {
    if (!focusSymbol) return alerts;
    return alerts.filter((a) => (a.symbol ?? "").toUpperCase() === focusSymbol);
  }, [alerts, focusSymbol]);

  const createAlert = useCallback(async () => {
    const type = formType.trim();
    const symbol = formSymbol.trim().toUpperCase() || null;
    const condition = formCondition.trim() || null;
    const keyword = formKeyword.trim() || null;
    const threshold = formThreshold.trim() === "" ? null : Number(formThreshold);

    if (!type) return;
    if (type === "price" && (threshold == null || !Number.isFinite(threshold))) {
      setError("Price alerts need a valid threshold.");
      return;
    }
    if (type === "price" && !priceAlertRuntimeOk(runtimeCheck.state)) {
      setError(runtimeCheck.reason || "Broker runtime not ready for this symbol.");
      return;
    }
    if ((type === "news" || type === "macro") && !keyword) {
      setError("News/Macro alerts need a keyword.");
      return;
    }

    const stopLoss = type === "price" ? parseOptionalPrice(formStopLoss) : null;
    const takeProfit = type === "price" ? parseOptionalPrice(formTakeProfit) : null;

    if (type === "price" && tradePrefs.alertAutoTradeEnabled) {
      if (stopLoss == null || takeProfit == null) {
        setError("Alert auto-trade is on — set stop loss and take profit on this alert.");
        return;
      }
      const side = formTradeSide;
      if (threshold != null) {
        const stopErr = validateAlertTradeStops(side, threshold, stopLoss, takeProfit);
        if (stopErr) {
          setError(stopErr);
          return;
        }
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          symbol,
          condition: type === "price" ? condition : null,
          threshold: type === "price" ? threshold : null,
          keyword: type === "news" || type === "macro" ? keyword : null,
          status: "active",
          metadata: {
            delivery: push?.hasSubscription && push?.vapidConfigured ? "push" : "in_app",
            ...(type === "price" ? { trade_side: formTradeSide } : {}),
            ...(type === "price" && tradePrefs.alertAutoTradeEnabled
              ? { auto_trade_enabled: true }
              : {}),
            ...(type === "price" && stopLoss != null ? { stop_loss: stopLoss } : {}),
            ...(type === "price" && takeProfit != null ? { take_profit: takeProfit } : {}),
          },
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not create alert.");
        return;
      }

      setFormThreshold("");
      setFormStopLoss("");
      setFormTakeProfit("");
      setStopsTouched(false);
      setFormKeyword("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [
    formType,
    formSymbol,
    formCondition,
    formTradeSide,
    formThreshold,
    formStopLoss,
    formTakeProfit,
    formKeyword,
    push,
    refresh,
    runtimeCheck,
    tradePrefs.alertAutoTradeEnabled,
  ]);

  const setAlertStatus = useCallback(
    async (id: string, status: "active" | "paused") => {
      setError(null);
      const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not update alert.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      setError(null);
      const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not delete alert.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const refineDraft = useMemo(
    () =>
      buildAlertRefineDraft({
        symbol: formSymbol,
        type: formType,
        condition: formCondition,
        tradeSide: formTradeSide,
        threshold: formThreshold,
        keyword: formKeyword,
        defaultVolume: tradePrefs.defaultVolume,
        alertAutoTradeEnabled: tradePrefs.alertAutoTradeEnabled,
        stopLoss: formStopLoss,
        takeProfit: formTakeProfit,
      }),
    [
      formSymbol,
      formType,
      formCondition,
      formTradeSide,
      formThreshold,
      formStopLoss,
      formTakeProfit,
      formKeyword,
      tradePrefs.defaultVolume,
      tradePrefs.alertAutoTradeEnabled,
    ],
  );

  const goRefineInChat = useCallback(() => {
    stageChatPrefill(refineDraft);
    router.push(chatHrefWithPrefill(refineDraft));
  }, [refineDraft, router]);

  const delivery = deliveryPill(push);
  const entryPrice = parseOptionalPrice(formThreshold);
  const priceHints = slTpHints(formTradeSide, entryPrice);

  const toolbarSections: AxeToolbarSection[] = useMemo(
    () => [
      {
        id: "ask-axe",
        title: "Ask AXE",
        items: [
          {
            id: "draft",
            label: "Draft alert rules",
            description: "Let AXE propose thresholds + wording",
            href: chatQ(
              `[AXE · alerts]\nDraft 3 useful alert rules for ${focusSymbol || "my watchlist"} (price + risk + context). Keep them explicit and actionable. Include threshold suggestions.`,
            ),
          },
          {
            id: "push",
            label: "How does push work?",
            description: "Status, setup, what is live today",
            href: chatQ(
              `[AXE · push]\nExplain push notifications status for AXE Companion: what is wired today, what needs setup, and how TradingOS can trigger alerts.`,
            ),
          },
        ],
      },
      {
        id: "shortcuts",
        title: "Shortcuts",
        items: [
          {
            id: "chart",
            label: "Open chart",
            description: focusSymbol ? `Chart ${focusSymbol}` : "Go to chart",
            href: focusSymbol ? `/chart?symbol=${encodeURIComponent(focusSymbol)}` : "/chart",
          },
          {
            id: "market",
            label: "Market context",
            description: "Macro + news + calendar",
            href: "/market",
          },
        ],
      },
    ],
    [focusSymbol],
  );

  const { setCenter, setRight } = useAppTopBar();
  useEffect(() => {
    // Mobile top bar: only the AXE wordmark + pulse now lives in the
    // centre. The delivery status moved into the AXE pulse + inline
    // "Push notifications" panel below. Keeping the center slot clear
    // matches the chart-page-excluded layout the user asked for.
    setCenter(null);
    setRight(
      <AxeContextToolbar
        title="Alerts"
        subtitle={focusSymbol ? `${focusSymbol} rules` : "Saved rules"}
        sections={toolbarSections}
      />,
    );
    return () => {
      setCenter(null);
      setRight(null);
    };
  }, [setCenter, setRight, focusSymbol, toolbarSections]);

  // Push the delivery state into the global AXE-pulse bus.
  // "live" means the alerts engine is reachable and at least one
  // delivery channel (in-app or push) is wired up.
  useEffect(() => {
    const inAppLive = !error;
    const pushLive = push?.vapidConfigured === true && push?.hasSubscription === true;
    const channelsLive = (inAppLive ? 1 : 0) + (pushLive ? 1 : 0);
    const totalChannels = 1 + (push?.vapidConfigured ? 1 : 0);
    setLiveStatus({
      allLive: inAppLive ? true : false,
      liveCount: channelsLive,
      totalCount: totalChannels,
      freshestAgeSec: null,
      label: `Alerts · ${delivery.short}`,
      severity: error ? "degraded" : "fresh",
      reason: error ?? "Alert manager reachable. Price alerts still require a verified broker symbol.",
      scope: "alerts",
    });
    return () => {
      clearLiveStatusScope("alerts");
    };
  }, [error, push?.vapidConfigured, push?.hasSubscription, delivery.short]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto gap-3 pb-2">
      {/* Desktop header; mobile uses AppTopBar slots */}
      <div className="hidden items-center justify-between gap-3 border-b border-white/[0.04] py-2 md:flex">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-white/60" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-tos-text">Alerts</p>
            <p className="text-xs text-tos-muted">No simulated triggers. Push stays explicit.</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${delivery.className}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${delivery.dot}`} aria-hidden />
          {delivery.label}
        </span>
      </div>

      {focusSymbol ? (
        <p className="text-xs text-tos-muted">
          Focus symbol: <span className="font-mono text-white/80">{focusSymbol}</span> —{" "}
          <Link href="/alerts" className="text-white/70 hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {/* Push enablement — surfaced inline on this page so users don't need to
          dig into Settings. Only renders when push is actually configured on
          the deployment AND the user hasn't subscribed yet. */}
      {push?.vapidConfigured && !push.hasSubscription ? (
        <GlassPanel className="p-4" glow="none">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            Enable notifications on this device
          </p>
          <PushPermission />
        </GlassPanel>
      ) : null}

      {/* In-app delivery is always live: the chart watches live ticks and
          fires the alert locally. Web-push is optional / additive. */}
      {push && !push.vapidConfigured ? (
        <GlassPanel className="p-3 text-[11px] text-tos-muted">
          <span className="font-semibold text-white/90">In-app alerts are live.</span>{" "}
          Open <Link href="/chart" className="text-white/70 hover:underline">Chart</Link> to evaluate
          price alerts on the active symbol. Push notifications are an extra channel — add VAPID
          keys on Vercel to also send them when the app is closed.
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-4" glow="none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tos-dim">Create alert</p>
          <p className="text-[11px] text-tos-muted">
            Delivery:{" "}
            <span className="font-semibold text-tos-text">
              {push?.hasSubscription && push?.vapidConfigured ? "push + in-app" : "in-app"}
            </span>
          </p>
        </div>
        <TosMatteBanner className="mt-3">
          <span className="font-semibold text-white/92">Runtime:</span>{" "}
          <span className="font-semibold text-white/88">
            {runtimeCheck.state === "valid"
              ? "Broker verified"
              : runtimeCheck.state === "checking"
                ? "Checking"
                : runtimeCheck.state === "degraded"
                  ? "Degraded"
                  : runtimeCheck.state === "unavailable"
                    ? "Unavailable"
                    : "Inactive"}
          </span>
          {runtimeCheck.brokerSymbol ? <span className="font-mono"> · {runtimeCheck.brokerSymbol}</span> : null}
          <span> · {runtimeCheck.reason}</span>
          {formType === "price" && runtimeCheck.state === "degraded" ? (
            <span className="mt-1 block text-amber-200/85">
              Live price is warming — you can still save the alert; evaluation runs when Chart is open.
            </span>
          ) : null}
        </TosMatteBanner>

        <TosMatteBanner accent="cyan" className="mt-3">
          <span className="font-semibold text-white/92">Your trade size (saved per account):</span>{" "}
          <span className="font-mono text-white/88">{tradePrefs.defaultVolume.toFixed(2)} lots</span>
          {" · "}
          Alert auto-trade:{" "}
          <span className={tradePrefs.alertAutoTradeEnabled ? "text-amber-200/90" : "text-white/72"}>
            {tradePrefs.alertAutoTradeEnabled ? "ON" : "OFF"}
          </span>
          {tradePrefs.alertAutoTradeEnabled ? (
            <>
              {" · "}
              Armed:{" "}
              <span className={armed ? "text-emerald-200/90" : "text-amber-200/90"}>
                {armed ? `YES (${armedRemainingMin}m left)` : "NO — tap Arm below"}
              </span>
              <span className="mt-1 block text-white/58">
                Global auto-trade is on, but orders only fire while armed (30 min window) and when each alert has auto-trade enabled.
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={armPending || armed}
                  onClick={() => void setArmState(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-100/90 disabled:opacity-50"
                >
                  <Shield className="h-3 w-3" aria-hidden />
                  Arm 30m
                </button>
                <button
                  type="button"
                  disabled={armPending || !armed}
                  onClick={() => void setArmState(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 disabled:opacity-50"
                >
                  Disarm
                </button>
              </span>
            </>
          ) : (
            <span className="mt-1 block text-white/58">
              Change in{" "}
              <Link href="/settings" className="text-cyan-300/90 hover:underline">
                Settings → Trade size &amp; alerts
              </Link>
              .
            </span>
          )}
        </TosMatteBanner>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-tos-dim">
            Type
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
            >
              <option value="price">Price (live on Chart)</option>
              <option value="position_risk">Position risk (saved)</option>
              <option value="news">News keyword (saved)</option>
              <option value="macro">Macro keyword (saved)</option>
              <option value="journal_reminder">Journal reminder (saved)</option>
            </select>
            {formType !== "price" ? (
              <p className="mt-1 text-[10px] leading-relaxed text-tos-dim">
                Only price alerts auto-evaluate today. Other types are stored for AXE context and future push hooks.
              </p>
            ) : null}
          </label>

          <label className="text-[11px] text-tos-dim">
            Symbol (optional)
            <input
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value)}
              placeholder="XAUUSD"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-tos-text outline-none focus:border-white/[0.15]"
            />
          </label>

          {formType === "price" ? (
            <>
              <label className="text-[11px] text-tos-dim sm:col-span-2">
                Alert fires when price
                <select
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
                >
                  <option value="below">Drops to level (price falls)</option>
                  <option value="above">Rises to level (price climbs)</option>
                </select>
                <span className="mt-1 block text-[10px] leading-relaxed text-tos-dim">
                  Example: gold at 4110 now, you want 4099 → choose <strong className="text-white/70">Drops to 4099</strong>.
                  That only controls <em>when</em> the alert fires — not buy vs sell.
                </span>
              </label>
              <label className="text-[11px] text-tos-dim">
                Price level
                <input
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  placeholder="4099.00"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
                />
              </label>
              {(tradePrefs.alertAutoTradeEnabled || formStopLoss || formTakeProfit) ? (
                <label className="text-[11px] text-tos-dim">
                  Auto-trade direction
                  <select
                    value={formTradeSide}
                    onChange={(e) => setFormTradeSide(e.target.value as AlertTradeSide)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
                  >
                    <option value="buy">Buy (long)</option>
                    <option value="sell">Sell (short)</option>
                  </select>
                  <span className="mt-1 block text-[10px] text-tos-dim">
                    {formCondition === "below" && formTradeSide === "buy"
                      ? "Buy on dip — like a buy limit when price reaches your level."
                      : formCondition === "above" && formTradeSide === "sell"
                        ? "Sell on rally — like a sell limit when price reaches your level."
                        : formCondition === "below" && formTradeSide === "sell"
                          ? "Sell breakdown — short when price breaks below your level."
                          : "Buy breakout — long when price breaks above your level."}
                  </span>
                </label>
              ) : null}
              <label className="text-[11px] text-tos-dim">
                Stop loss price {tradePrefs.alertAutoTradeEnabled ? "(required)" : "(optional)"}
                <input
                  value={formStopLoss}
                  onChange={(e) => {
                    setStopsTouched(true);
                    setFormStopLoss(e.target.value);
                  }}
                  placeholder={priceHints.stopLossPlaceholder}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
                />
              </label>
              <label className="text-[11px] text-tos-dim">
                Take profit price {tradePrefs.alertAutoTradeEnabled ? "(required)" : "(optional)"}
                <input
                  value={formTakeProfit}
                  onChange={(e) => {
                    setStopsTouched(true);
                    setFormTakeProfit(e.target.value);
                  }}
                  placeholder={priceHints.takeProfitPlaceholder}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
                />
              </label>
              {tradePrefs.alertAutoTradeEnabled ? (
                <p className="sm:col-span-2 text-[10px] leading-relaxed text-tos-dim">
                  SL and TP are absolute prices sent to MT5. {priceHints.summary}
                  {entryPrice != null ? (
                    <span className="mt-1 block text-white/45">
                      Entry ≈ {entryPrice} when the alert fires.
                    </span>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : null}

          {formType === "news" || formType === "macro" ? (
            <label className="text-[11px] text-tos-dim sm:col-span-2">
              Keyword
              <input
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                placeholder={formType === "news" ? "Powell, CPI, gold…" : "CPI, NFP, FOMC…"}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-[11px] text-amber-200/90">{error}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createAlert()}
            disabled={saving || (formType === "price" && runtimeCheck.state === "checking")}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-white/90 hover:bg-white/[0.08] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Create
          </button>
          <button
            type="button"
            onClick={goRefineInChat}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-tos-muted hover:bg-white/[0.06]"
          >
            <Check className="h-4 w-4 text-white/60" aria-hidden />
            Ask AXE to refine
          </button>
        </div>
      </GlassPanel>

      {loading ? (
        <GlassPanel className="p-4 text-sm text-tos-muted">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading alerts…
          </div>
        </GlassPanel>
      ) : visibleAlerts.length === 0 ? (
        <GlassPanel className="p-4 text-sm text-tos-muted">
          <p>No alerts yet. Create one above, or open Chart with a symbol to evaluate price alerts live.</p>
          <p className="mt-2 text-xs text-tos-dim">
            Price alerts trip in-app while Chart is open. Push is optional when VAPID keys and a device subscription exist.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {visibleAlerts.map((a) => {
            const paused = a.status === "paused";
            const stops = readAlertStopsFromMetadata(a.metadata);
            const tradeSide = readTradeSideFromMetadata(a.metadata, a.condition);
            const alertAutoOn =
              a.type === "price" &&
              tradePrefs.alertAutoTradeEnabled &&
              readAlertAutoTradeEnabled(a.metadata, true);
            return (
              <GlassPanel key={a.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-tos-text">{a.symbol ?? "—"}</span>
                    <Badge variant={badgeVariantForType(a.type)}>{humanAlertType(a.type)}</Badge>
                    <Badge variant={paused ? "neutral" : "long"}>{paused ? "paused" : "active"}</Badge>
                    {a.type === "price" && tradePrefs.alertAutoTradeEnabled ? (
                      <Badge variant={alertAutoOn ? "warm" : "neutral"}>
                        {alertAutoOn ? "auto-trade" : "notify only"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.type === "price" && tradePrefs.alertAutoTradeEnabled ? (
                      <button
                        type="button"
                        onClick={() => void toggleAlertAutoTrade(a, !alertAutoOn)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-tos-muted hover:bg-white/[0.06]"
                      >
                        <Zap className="h-3.5 w-3.5" aria-hidden />
                        {alertAutoOn ? "Disable auto" : "Enable auto"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void setAlertStatus(a.id, paused ? "active" : "paused")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-tos-muted hover:bg-white/[0.06]"
                    >
                      {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                      {paused ? "Enable" : "Pause"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAlert(a.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/8 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200/90 hover:bg-rose-500/12"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-tos-dim">
                  {a.condition === "below"
                    ? "Fires below"
                    : a.condition === "above"
                      ? "Fires above"
                      : a.condition ?? ""}
                  {a.threshold != null ? ` ${a.threshold}` : ""}
                  {tradeSide ? ` · ${tradeSide.toUpperCase()}` : ""}
                  {stops.stopLoss != null ? ` · SL ${stops.stopLoss}` : ""}
                  {stops.takeProfit != null ? ` · TP ${stops.takeProfit}` : ""}
                  {a.keyword ? ` · “${a.keyword}”` : ""}
                </p>
                <p className="mt-1 text-[10px] text-tos-dim">
                  {a.triggered_at ? `Triggered ${a.triggered_at}` : "Not triggered"}
                  {" · "}
                  {a.created_at}
                  {" · "}
                  {deliveryNoteForType(a.type)}
                </p>
              </GlassPanel>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] leading-relaxed text-tos-dim">
        Alerts evaluate live inside AXE Companion when the chart is open — push is an optional
        extra channel. TradingOS can also fire push via{" "}
        <code className="text-tos-muted">POST /api/push/alert</code> when both apps are online.
      </p>
    </div>
  );
}
