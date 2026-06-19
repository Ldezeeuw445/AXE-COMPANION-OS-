"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { useAppTopBar } from "@/components/shell/AppTopBarContext";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { PushPermission } from "@/components/push/PushPermission";
import { setLiveStatus, clearLiveStatus } from "@/lib/liveStatusBus";

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

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
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
  // Trading OS alerts are evaluated in-app: the chart screen watches live
  // ticks and trips alerts even when web-push is unavailable. So the default
  // "delivery" status is in-app-on-this-device, and push (if configured) is
  // an additional channel — never a hard requirement.
  if (!status) {
    return {
      label: "Delivery: in-app",
      short: "Live",
      className: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100/95",
      dot: "bg-cyan-300/85",
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
      short: "Live",
      className: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100/95",
      dot: "bg-cyan-300/85",
    };
  }
  return {
    label: "Delivery: in-app",
    short: "Live",
    className: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100/95",
    dot: "bg-cyan-300/85",
  };
}

export function AlertsClient({ initialSymbol }: { initialSymbol: string }) {
  const focusSymbol = initialSymbol.trim().toUpperCase();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);

  const [formType, setFormType] = useState<string>("price");
  const [formSymbol, setFormSymbol] = useState<string>(focusSymbol || "");
  const [formCondition, setFormCondition] = useState<string>("above");
  const [formThreshold, setFormThreshold] = useState<string>("");
  const [formKeyword, setFormKeyword] = useState<string>("");

  useEffect(() => {
    if (!focusSymbol) return;
    setFormSymbol(focusSymbol);
  }, [focusSymbol]);

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
    if ((type === "news" || type === "macro") && !keyword) {
      setError("News/Macro alerts need a keyword.");
      return;
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
          metadata: { delivery: push?.hasSubscription && push?.vapidConfigured ? "push" : "in_app" },
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Could not create alert.");
        return;
      }

      setFormThreshold("");
      setFormKeyword("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [formType, formSymbol, formCondition, formThreshold, formKeyword, push, refresh]);

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

  const delivery = deliveryPill(push);

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
              `[AXE · push]\nExplain push notifications status for Trading OS: what is wired today, what needs setup, and how TradingOS can trigger alerts.`,
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
    });
    return () => {
      clearLiveStatus();
    };
  }, [error, push?.vapidConfigured, push?.hasSubscription, delivery.short]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
      {/* Desktop header; mobile uses AppTopBar slots */}
      <div className="hidden items-center justify-between gap-3 border-b border-white/[0.04] py-2 md:flex">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-cyan-400/80" aria-hidden />
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
          Focus symbol: <span className="font-mono text-cyan-200/90">{focusSymbol}</span> —{" "}
          <Link href="/alerts" className="text-cyan-400 hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {/* Push enablement — surfaced inline on this page so users don't need to
          dig into Settings. Only renders when push is actually configured on
          the deployment AND the user hasn't subscribed yet. */}
      {push?.vapidConfigured && !push.hasSubscription ? (
        <GlassPanel className="p-4" glow="cyan">
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
          <span className="font-semibold text-cyan-200/95">In-app alerts are live.</span>{" "}
          Open <Link href="/chart" className="text-cyan-400 hover:underline">Chart</Link> to evaluate
          price alerts on the active symbol. Push notifications are an extra channel — add VAPID
          keys on Vercel to also send them when the app is closed.
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-4" glow="cyan">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tos-dim">Create alert</p>
          <p className="text-[11px] text-tos-muted">
            Delivery:{" "}
            <span className="font-semibold text-tos-text">
              {push?.hasSubscription && push?.vapidConfigured ? "push + in-app" : "in-app"}
            </span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-tos-dim">
            Type
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[12px] text-tos-text outline-none focus:border-cyan-500/35"
            >
              <option value="price">price</option>
              <option value="position_risk">position_risk</option>
              <option value="news">news</option>
              <option value="macro">macro</option>
              <option value="journal_reminder">journal_reminder</option>
            </select>
          </label>

          <label className="text-[11px] text-tos-dim">
            Symbol (optional)
            <input
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value)}
              placeholder="XAUUSD"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-tos-text outline-none focus:border-cyan-500/35"
            />
          </label>

          {formType === "price" ? (
            <>
              <label className="text-[11px] text-tos-dim">
                Condition
                <select
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[12px] text-tos-text outline-none focus:border-cyan-500/35"
                >
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
              </label>
              <label className="text-[11px] text-tos-dim">
                Threshold
                <input
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  placeholder="2356.50"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-cyan-500/35"
                />
              </label>
            </>
          ) : null}

          {formType === "news" || formType === "macro" ? (
            <label className="text-[11px] text-tos-dim sm:col-span-2">
              Keyword
              <input
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                placeholder={formType === "news" ? "Powell, CPI, gold…" : "CPI, NFP, FOMC…"}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[12px] text-tos-text outline-none focus:border-cyan-500/35"
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-[11px] text-amber-200/90">{error}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createAlert()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/12 px-3 py-2 text-[12px] font-semibold text-cyan-100/95 hover:bg-cyan-500/18 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Create
          </button>
          <Link
            href={chatQ(
              `[AXE · alerts]\nDraft a single alert for ${formSymbol || "my account"}.\nType: ${formType}\nCondition: ${formCondition}\nThreshold: ${formThreshold || "?"}\nKeyword: ${formKeyword || "?"}\nReturn a crisp rule + suggested values.`,
            )}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-tos-muted hover:bg-white/[0.06]"
          >
            <Check className="h-4 w-4 text-cyan-400/80" aria-hidden />
            Ask AXE to refine
          </Link>
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
          <p>No alerts yet. Create one above, or set from Chart → “Set price alert”.</p>
          <p className="mt-2 text-xs text-tos-dim">
            Note: push delivery only happens when a device is subscribed and TradingOS triggers `/api/push/alert`.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {visibleAlerts.map((a) => {
            const paused = a.status === "paused";
            return (
              <GlassPanel key={a.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-tos-text">{a.symbol ?? "—"}</span>
                    <Badge variant={badgeVariantForType(a.type)}>{a.type}</Badge>
                    <Badge variant={paused ? "neutral" : "long"}>{paused ? "paused" : "active"}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                  {a.condition ? `${a.condition}` : null}
                  {a.threshold != null ? ` · ${a.threshold}` : ""}
                  {a.keyword ? ` · “${a.keyword}”` : ""}
                </p>
                <p className="mt-1 text-[10px] text-tos-dim">
                  {a.triggered_at ? `Triggered ${a.triggered_at}` : "Not triggered"}
                  {" · "}
                  {a.created_at}
                </p>
              </GlassPanel>
            );
          })}
        </div>
      )}

      <p className="text-center text-[10px] leading-relaxed text-tos-dim">
        Alerts evaluate live inside Trading OS when the chart is open — push is an optional
        extra channel. TradingOS can also fire push via{" "}
        <code className="text-tos-muted">POST /api/push/alert</code> when both apps are online.
      </p>
    </div>
  );
}

