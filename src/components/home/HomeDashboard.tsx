"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calendarMonthPnl,
  equityPolyline,
  localDayKey,
  matchesHomeFilter,
  openPnlSum,
  openRiskToStops,
  performanceStats,
} from "@/lib/home/homeStats";
import {
  clockLabel,
  formatCountdown,
  formatSessionStatusLine,
  FX_SESSIONS,
  nowMarkerPct,
  sessionClock,
  sessionTimelineBlocks,
  type SessionClock,
} from "@/lib/home/sessionClock";
import {
  formatClockTime,
  formatMoney,
  formatPct,
  formatPrice,
  pnlTone,
  relativeTime,
  shortAddress,
  sideKind,
} from "@/lib/home/format";
import type {
  HomePageData,
  HomePosition,
  HomeQuote,
  HomeWallet,
} from "@/lib/home/homeTypes";
import "./home.css";

const PREVIEW = 5;
const MODE_KEY = "axe.home-mode";

type Mode = "beginner" | "pro";

function ExpandBtn({
  expanded,
  onClick,
  label = "Expand",
}: {
  expanded: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="home-expand" aria-expanded={expanded} onClick={onClick}>
      <svg className="home-chev" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {expanded ? "Collapse" : label}
    </button>
  );
}

function SideTag({ side, label }: { side: string; label: string }) {
  const kind = sideKind(side);
  return <span className={`home-side is-${kind}`}>{label}</span>;
}

function toneClass(n: number | null | undefined): string {
  const t = pnlTone(n);
  return t === "mut" ? "home-mut" : t === "up" ? "home-up" : "home-dn";
}

function meterWidth(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "0%";
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function HomeDashboard({
  data,
}: {
  data: HomePageData;
}) {
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState<Mode>("pro");
  const [accountId, setAccountId] = useState<string>("all");
  const [pair, setPair] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [quotes, setQuotes] = useState<HomeQuote[]>(data.quotes);
  const [wallets, setWallets] = useState<HomeWallet[]>(data.wallets);
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [calc, setCalc] = useState({ entry: "", sl: "", tp: "" });
  const viewZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === "beginner" || saved === "pro") setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/quotes/prices", { credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as { prices?: Record<string, { price?: number | null }> };
        if (!body.prices || cancelled) return;
        setQuotes((prev) =>
          prev.map((q) => {
            const next = body.prices?.[q.symbol] ?? body.prices?.[q.displaySymbol];
            const price = next?.price ?? q.price;
            return price != null ? { ...q, price, state: "live" } : q;
          }),
        );
      } catch {
        /* keep last */
      }
    }
    void poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (data.wallets.length === 0) return;
    let cancelled = false;
    void fetch("/api/wallets?refresh=true", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { wallets?: Array<HomeWallet & { balance?: { nativeAmount?: number; nativeSymbol?: string; usdEstimate?: number | null } | null }> } | null) => {
        if (cancelled || !body?.wallets) return;
        setWallets(
          body.wallets.map((w) => ({
            id: w.id,
            label: w.label,
            chain: w.chain,
            address: w.address,
            nativeAmount: w.balance?.nativeAmount ?? w.nativeAmount,
            nativeSymbol: w.balance?.nativeSymbol ?? w.nativeSymbol,
            usdEstimate: w.balance?.usdEstimate ?? w.usdEstimate,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data.wallets.length]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const setModePersist = useCallback((next: Mode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const pairOptions = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) if (q.displaySymbol) set.add(q.displaySymbol);
    for (const p of data.positions) if (p.symbol) set.add(p.symbol);
    for (const t of data.trades) if (t.symbol) set.add(t.symbol);
    return ["ALL", ...Array.from(set).sort()];
  }, [quotes, data.positions, data.trades]);

  const clock = useMemo(() => clockLabel(now, viewZone), [now, viewZone]);
  const sessions = useMemo(
    () => FX_SESSIONS.map((def) => ({ def, clock: sessionClock(def, now) as SessionClock })),
    [now],
  );
  const openSession = sessions.find((s) => s.clock.status === "open");
  const timeline = useMemo(
    () =>
      FX_SESSIONS.flatMap((def, i) =>
        sessionTimelineBlocks(def, now, viewZone).map((b) => ({
          ...b,
          color:
            def.id === "ldn"
              ? "rgba(47, 191, 143, 0.32)"
              : def.id === "nyc"
                ? "rgba(224, 166, 75, 0.28)"
                : i % 2 === 0
                  ? "rgba(106, 174, 188, 0.16)"
                  : "rgba(106, 174, 188, 0.30)",
        })),
      ),
    [now, viewZone],
  );

  const filteredPositions = useMemo(
    () =>
      data.positions.filter((p) => {
        if (accountId !== "all" && data.positionsAccountId && accountId !== data.positionsAccountId) return false;
        return matchesHomeFilter({ accountId: p.accountId, symbol: p.symbol }, accountId, pair);
      }),
    [data.positions, data.positionsAccountId, accountId, pair],
  );
  const positionsHidden =
    accountId !== "all" && Boolean(data.positionsAccountId) && accountId !== data.positionsAccountId;

  const filteredTrades = useMemo(
    () => data.trades.filter((t) => matchesHomeFilter(t, accountId, pair)),
    [data.trades, accountId, pair],
  );
  const filteredJournal = useMemo(
    () => data.journal.filter((j) => matchesHomeFilter({ symbol: j.symbol }, accountId, pair)),
    [data.journal, accountId, pair],
  );
  const filteredAlerts = useMemo(
    () => data.alerts.filter((a) => matchesHomeFilter({ symbol: a.symbol }, accountId, pair)),
    [data.alerts, accountId, pair],
  );
  const filteredNews = useMemo(
    () => data.news.filter((n) => matchesHomeFilter({ symbols: n.symbols.length ? n.symbols : undefined }, accountId, pair)),
    [data.news, accountId, pair],
  );
  const filteredEvents = useMemo(() => {
    if (pair === "ALL") return data.events;
    return data.events.filter((e) => {
      const hay = `${e.title} ${e.currency ?? ""} ${e.country ?? ""}`.toUpperCase();
      return hay.includes(pair.slice(0, 3)) || hay.includes(pair.slice(-3));
    });
  }, [data.events, pair]);

  const selectedAccounts = useMemo(
    () => (accountId === "all" ? data.accounts : data.accounts.filter((a) => a.id === accountId)),
    [data.accounts, accountId],
  );

  const equity = selectedAccounts.reduce((s, a) => s + (a.equity ?? 0), 0);
  const balance = selectedAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const hasEquity = selectedAccounts.some((a) => a.equity != null);
  const hasBalance = selectedAccounts.some((a) => a.balance != null);
  const openPnl = openPnlSum(filteredPositions);
  const todayKey = localDayKey(now, viewZone);
  const realizedToday = filteredTrades
    .filter((t) => t.closeTime && localDayKey(new Date(t.closeTime), viewZone) === todayKey)
    .reduce((s, t) => s + t.pnl + t.fees, 0);
  const dayPnl = realizedToday + openPnl;
  const dayPct = hasBalance && balance ? (dayPnl / balance) * 100 : null;
  const risk = openRiskToStops(filteredPositions);
  const propAccount = selectedAccounts.length === 1 ? selectedAccounts[0] : selectedAccounts.find((a) => a.isProp) ?? null;
  const dailyRoom =
    propAccount && propAccount.maxDailyLossPct != null && propAccount.balance != null
      ? (propAccount.balance * propAccount.maxDailyLossPct) / 100
      : null;
  const roomUsedPct =
    dailyRoom && dailyRoom > 0 && dayPnl < 0 ? Math.min(100, (Math.abs(dayPnl) / dailyRoom) * 100) : 0;
  const remainingRoom = dailyRoom != null ? Math.max(0, dailyRoom + Math.min(0, dayPnl)) : null;
  const riskPctOfRoom = dailyRoom && risk != null ? (risk / dailyRoom) * 100 : null;

  const stats = performanceStats(filteredTrades);
  const curve = equityPolyline(stats.equity);
  const monthMap = calendarMonthPnl(filteredTrades, calCursor.y, calCursor.m, viewZone);
  const monthVals = Object.values(monthMap);
  const monthHi = monthVals.length ? Math.max(...monthVals) : null;
  const monthLo = monthVals.length ? Math.min(...monthVals) : null;
  const monthTot = monthVals.reduce((a, b) => a + b, 0);
  const monthGp = monthVals.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const monthGl = Math.abs(monthVals.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const monthPf = monthGl > 0 ? monthGp / monthGl : null;

  const firstOfMonth = new Date(calCursor.y, calCursor.m, 1);
  const startPad = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth() === calCursor.m && now.getFullYear() === calCursor.y;

  const previewPositions = filteredPositions.slice(0, PREVIEW);
  const morePositions = filteredPositions.slice(PREVIEW);
  const previewTrades = filteredTrades.slice(0, PREVIEW);
  const moreTrades = filteredTrades.slice(PREVIEW);
  const previewJournal = filteredJournal.slice(0, 4);
  const moreJournal = filteredJournal.slice(4);
  const previewAlerts = filteredAlerts.slice(0, 4);
  const moreAlerts = filteredAlerts.slice(4);
  const previewNews = filteredNews.slice(0, 4);
  const moreNews = filteredNews.slice(4);
  const previewEvents = filteredEvents.slice(0, 5);
  const moreEvents = filteredEvents.slice(5);

  const seeded = useMemo(() => {
    const open = filteredPositions.find((p) => !p.pending && p.openPrice != null);
    return {
      entry: open?.openPrice != null ? String(open.openPrice) : "",
      sl: open?.stopLoss != null ? String(open.stopLoss) : "",
      tp: open?.takeProfit != null ? String(open.takeProfit) : "",
    };
  }, [filteredPositions]);

  useEffect(() => {
    setCalc((prev) => (prev.entry || prev.sl || prev.tp ? prev : seeded));
  }, [seeded]);

  const entryN = Number(calc.entry);
  const slN = Number(calc.sl);
  const tpN = Number(calc.tp);
  const riskDist = Number.isFinite(entryN) && Number.isFinite(slN) ? Math.abs(entryN - slN) : null;
  const rewardDist = Number.isFinite(entryN) && Number.isFinite(tpN) ? Math.abs(tpN - entryN) : null;
  const rr = riskDist && riskDist > 0 && rewardDist != null ? rewardDist / riskDist : null;
  const breakeven = Number.isFinite(entryN) ? entryN : null;

  const accountLabel =
    accountId === "all" ? "all accounts" : data.accounts.find((a) => a.id === accountId)?.label ?? "account";
  const pairLabel = pair === "ALL" ? "all pairs" : pair;
  const openCount = filteredPositions.filter((p) => !p.pending).length;
  const pendCount = filteredPositions.filter((p) => p.pending).length;
  const activityExpanded = Boolean(expanded.activity);
  const fundedExpanded = Boolean(expanded.funded);
  const calExpanded = Boolean(expanded.calendar);
  const journalExpanded = Boolean(expanded.journal);
  const alertsExpanded = Boolean(expanded.alerts);
  const newsExpanded = Boolean(expanded.news);

  const challengePct =
    propAccount && propAccount.balance && propAccount.equity != null && propAccount.balance > 0
      ? ((propAccount.equity - propAccount.balance) / propAccount.balance) * 100
      : null;

  return (
    <div className={`home-v2 ${mode === "beginner" ? "is-beginner" : ""}`} data-testid="home-dashboard">
      <div className="home-sess-strip" data-chrome="session">
        <div className="home-clock">
          <span className="home-live-dot" title="Live clock" />
          <span className="home-clock-time">{clock.time}</span>
          <span className="home-clock-tz">{clock.zone}</span>
        </div>
        {sessions.map(({ def, clock: c }) => (
          <span key={def.id} className={`home-sess is-${c.status}`} title={`${def.name} (${def.timeZone})`}>
            <span className="home-sess-dot" />
            <span className="home-sess-code">{def.code}</span>
            <span className="home-sess-time">{c.localTime}</span>
            <span className="home-sess-st">
              {c.status === "open" ? "Open" : c.status === "soon" ? "Soon" : "Closed"}
            </span>
          </span>
        ))}
      </div>

      {quotes.length > 0 ? (
        <div className="home-ticker" data-testid="home-ticker">
          <div className="home-ticker-track">
            {[...quotes, ...quotes].map((q, i) => (
              <span className="home-tick" key={`${q.symbol}-${i}`}>
                <span className="home-tick-sym">{q.displaySymbol}</span>
                <span className="home-num" style={{ color: "var(--home-tx-1)" }}>
                  {formatPrice(q.price)}
                </span>
                {q.changePercent != null ? (
                  <span className={`home-num ${toneClass(q.changePercent)}`}>{formatPct(q.changePercent)}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="home-page-head">
        <div>
          <div className="home-page-title">Home</div>
          <div className="home-page-sub">
            Your terminal at a glance.{" "}
            <span className="home-hint" style={{ display: mode === "beginner" ? "inline" : undefined }}>
              Bright colour is what to notice. Use the pair chips to focus news, trades and the calendar.
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="home-seg" role="group" aria-label="Experience mode">
            <button
              type="button"
              className={`home-seg-btn ${mode === "beginner" ? "is-on" : ""}`}
              aria-pressed={mode === "beginner"}
              onClick={() => setModePersist("beginner")}
            >
              Beginner
            </button>
            <button
              type="button"
              className={`home-seg-btn ${mode === "pro" ? "is-on" : ""}`}
              aria-pressed={mode === "pro"}
              onClick={() => setModePersist("pro")}
            >
              Pro
            </button>
          </div>
          <Link href="/chat" className="home-ask">
            Ask AXE
          </Link>
        </div>
      </div>

      <div className="home-filters" aria-label="Account and pair filters">
        <div className="home-filter-group">
          <span className="home-cap">Account</span>
          <div className="home-seg" role="group" aria-label="Account">
            <button
              type="button"
              className={`home-seg-btn ${accountId === "all" ? "is-on" : ""}`}
              aria-pressed={accountId === "all"}
              onClick={() => setAccountId("all")}
            >
              All accounts
            </button>
            {data.accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`home-seg-btn ${accountId === a.id ? "is-on" : ""}`}
                aria-pressed={accountId === a.id}
                onClick={() => setAccountId(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="home-filter-group">
          <span className="home-cap">Pair</span>
          <div className="home-chips" role="group" aria-label="Pair filter">
            {pairOptions.map((p) => (
              <button
                key={p}
                type="button"
                className={`home-chip ${pair === p ? "is-on" : ""}`}
                aria-pressed={pair === p}
                onClick={() => setPair(p)}
              >
                {p === "ALL" ? "All pairs" : p}
              </button>
            ))}
          </div>
        </div>
        <div className="home-filter-status">
          Showing <b>{pairLabel}</b> · <b>{accountLabel}</b>
        </div>
      </div>

      {data.loadError ? (
        <p className="home-mut" style={{ fontSize: 12, padding: "0 2px" }} role="status">
          Some Home figures could not load: {data.loadError}
        </p>
      ) : null}

      <section className="home-row home-row-4" aria-label="Account overview">
        <article className="home-card home-kpi">
          <header className="home-card-h">
            <span className="home-cap">Equity</span>
            <span className="grow" />
            <span className="home-badge">{data.figuresFromCache ? "Snapshot" : hasEquity ? "Live" : "—"}</span>
          </header>
          <div className="home-card-b">
            <div className="home-kpi-val">{hasEquity ? formatMoney(equity) : "—"}</div>
            <div className="home-kpi-sub">
              Balance <span className="home-num">{hasBalance ? formatMoney(balance) : "—"}</span>
              {filteredPositions.some((p) => !p.pending) ? (
                <>
                  {" "}
                  · Open <span className={`home-num ${toneClass(openPnl)}`}>{formatMoney(openPnl, { sign: true })}</span>
                </>
              ) : null}
            </div>
            <p className="home-hint">What the selected account is worth right now, including open trades.</p>
          </div>
        </article>
        <article className="home-card home-kpi">
          <header className="home-card-h">
            <span className="home-cap">Day P/L</span>
            <span className="grow" />
            <span className="home-badge">Today</span>
          </header>
          <div className="home-card-b">
            <div className={`home-kpi-val ${toneClass(dayPnl)}`}>
              {filteredTrades.length || filteredPositions.length ? formatMoney(dayPnl, { sign: true }) : "—"}
            </div>
            <div className="home-kpi-sub">
              {dayPct != null ? <span className={`home-num ${toneClass(dayPct)}`}>{formatPct(dayPct)}</span> : null}
              <span>
                Realized <span className={`home-num ${toneClass(realizedToday)}`}>{formatMoney(realizedToday, { sign: true })}</span>
              </span>
            </div>
            <div className={`home-meter ${dayPnl >= 0 ? "home-meter-up" : "home-meter-warn"}`}>
              <i style={{ width: meterWidth(dayPct != null ? Math.min(100, Math.abs(dayPct) * 8) : 0) }} />
            </div>
            <p className="home-hint">Today’s P/L for the selected account and pair, in your local day.</p>
          </div>
        </article>
        <article className="home-card home-kpi">
          <header className="home-card-h">
            <span className="home-cap">Open risk / daily room</span>
            <span className="grow" />
            <span className="home-badge">
              {propAccount?.maxDailyLossPct != null ? `${propAccount.maxDailyLossPct}%` : "Risk"}
            </span>
          </header>
          <div className="home-card-b">
            <div className={`home-kpi-val ${risk != null ? "home-warn" : ""}`}>{formatMoney(risk)}</div>
            <div className="home-kpi-sub">
              To stops · Room <span className="home-num">{formatMoney(remainingRoom)}</span>
            </div>
            <div className="home-dual">
              <div className="home-dual-col">
                <div className="home-dual-lab">
                  <span>Risk</span>
                  <span className="home-num">{riskPctOfRoom != null ? `${riskPctOfRoom.toFixed(1)}%` : "—"}</span>
                </div>
                <div className="home-meter home-meter-warn">
                  <i style={{ width: meterWidth(riskPctOfRoom) }} />
                </div>
              </div>
              <div className="home-dual-col">
                <div className="home-dual-lab">
                  <span>Room used</span>
                  <span className="home-num">{dailyRoom != null ? `${roomUsedPct.toFixed(0)}%` : "—"}</span>
                </div>
                <div className="home-meter home-meter-accent">
                  <i style={{ width: meterWidth(roomUsedPct) }} />
                </div>
              </div>
            </div>
            <p className="home-hint">How much you can lose if every stop is hit, versus the firm’s daily room when known.</p>
          </div>
        </article>
        <article className="home-card home-kpi">
          <header className="home-card-h">
            <span className="home-cap">{propAccount?.isProp ? "Challenge" : "Account"}</span>
            <span className="grow" />
            <span className="home-badge">{propAccount?.kindLabel ?? (selectedAccounts.length > 1 ? `${selectedAccounts.length}` : "Status")}</span>
          </header>
          <div className="home-card-b">
            <div className="home-kpi-val">
              {propAccount?.isProp && challengePct != null
                ? formatPct(challengePct, 1).replace("%", "") + "%"
                : selectedAccounts.length
                  ? selectedAccounts.length === 1
                    ? selectedAccounts[0].kindLabel
                    : `${selectedAccounts.length}`
                  : "—"}
            </div>
            <div className="home-kpi-sub">
              {propAccount?.firmName ?? (selectedAccounts[0]?.label ?? "Connect an account")}
              {propAccount?.firmModel ? ` · ${propAccount.firmModel}` : null}
            </div>
            {propAccount?.isProp ? (
              <div className="home-meter home-meter-accent">
                <i style={{ width: meterWidth(challengePct != null ? Math.max(0, challengePct) : 0) }} />
              </div>
            ) : null}
            <p className="home-hint">
              {propAccount?.isProp
                ? "Open profit versus starting balance on the selected prop account. Target % is only shown when the firm’s rules are known."
                : "What kind of book this is. Prop rules appear here when AXE can read them from the account."}
            </p>
          </div>
        </article>
      </section>

      <section className={`home-row home-row-1 ${fundedExpanded ? "is-expanded" : ""}`} aria-label="Accounts">
        <article className={`home-card ${fundedExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <span className="home-card-title">
              {propAccount?.isProp && accountId !== "all" ? "Funded account suite" : "Accounts"}
            </span>
            <span className="grow" />
            <span className="home-badge">
              {propAccount && accountId !== "all"
                ? [propAccount.firmName, propAccount.kindLabel].filter(Boolean).join(" · ") || "Prop"
                : `${data.accounts.length} linked`}
            </span>
            <ExpandBtn expanded={fundedExpanded} onClick={() => toggle("funded")} />
          </header>
          <div className="home-card-b">
            {data.accounts.length === 0 ? (
              <div className="home-empty" style={{ display: "block" }}>
                No broker account yet.{" "}
                <Link className="home-link" href="/accounts">
                  Connect MT5
                </Link>
              </div>
            ) : accountId === "all" || selectedAccounts.length > 1 ? (
              <>
                <div className="home-mini-accts">
                  {selectedAccounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="home-mini-acct"
                      onClick={() => setAccountId(a.id)}
                      style={{ textAlign: "left", cursor: "pointer", border: 0, color: "inherit" }}
                    >
                      <div className="home-cap">
                        {a.label} · {a.kindLabel}
                      </div>
                      <div className="home-num" style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: "var(--home-tx-1)" }}>
                        {formatMoney(a.equity)}
                      </div>
                      <div className="home-gauge-sub">
                        {a.isProp
                          ? `${a.firmName ?? "Prop"} · daily room ${a.maxDailyLossPct != null ? `${a.maxDailyLossPct}%` : "unknown"}`
                          : a.kindLabel}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="home-hint" style={{ display: "block", marginTop: 8 }}>
                  The funded gauges are per prop account. Pick one account to open the full suite.
                </p>
              </>
            ) : propAccount?.isProp ? (
              <>
                <div className="home-gauges">
                  <div className="home-gauge">
                    <div className="home-cap">Remaining max DD</div>
                    <div className="home-gauge-val">
                      {propAccount.maxTotalLossPct != null && propAccount.balance != null
                        ? formatMoney(
                            Math.max(
                              0,
                              (propAccount.balance * propAccount.maxTotalLossPct) / 100 -
                                Math.max(0, (propAccount.balance ?? 0) - (propAccount.equity ?? propAccount.balance)),
                            ),
                          )
                        : "—"}
                    </div>
                    <div className="home-gauge-sub">
                      {propAccount.maxTotalLossPct != null ? `${propAccount.maxTotalLossPct}% rule` : "Rule unknown"}
                    </div>
                  </div>
                  <div className="home-gauge">
                    <div className="home-cap">Remaining daily DD</div>
                    <div className="home-gauge-val">{formatMoney(remainingRoom)}</div>
                    <div className="home-gauge-sub">
                      {propAccount.maxDailyLossPct != null
                        ? `${propAccount.maxDailyLossPct}% from start of day`
                        : "Rule unknown"}
                    </div>
                  </div>
                  <div className="home-gauge">
                    <div className="home-cap">Open P/L</div>
                    <div className={`home-gauge-val ${toneClass(openPnl)}`}>{formatMoney(openPnl, { sign: true })}</div>
                    <div className="home-gauge-sub">Versus last snapshot equity</div>
                  </div>
                  <div className="home-gauge">
                    <div className="home-cap">Balance</div>
                    <div className="home-gauge-val">{formatMoney(propAccount.balance)}</div>
                    <div className="home-gauge-sub">{propAccount.firmName ?? "Prop account"}</div>
                  </div>
                </div>
                <div className="home-extra">
                  <div className="home-gauges" style={{ marginTop: 8 }}>
                    <div className="home-gauge">
                      <div className="home-cap">Equity</div>
                      <div className="home-gauge-val">{formatMoney(propAccount.equity)}</div>
                    </div>
                    <div className="home-gauge">
                      <div className="home-cap">Realized</div>
                      <div className={`home-gauge-val ${toneClass(propAccount.realizedNet)}`}>
                        {formatMoney(propAccount.realizedNet, { sign: true })}
                      </div>
                    </div>
                    <div className="home-gauge">
                      <div className="home-cap">Daily loss</div>
                      <div className="home-gauge-val">
                        {propAccount.maxDailyLossPct != null ? `${propAccount.maxDailyLossPct}%` : "—"}
                      </div>
                    </div>
                    <div className="home-gauge">
                      <div className="home-cap">Max loss</div>
                      <div className="home-gauge-val">
                        {propAccount.maxTotalLossPct != null ? `${propAccount.maxTotalLossPct}%` : "—"}
                      </div>
                    </div>
                  </div>
                  <p className="home-hint" style={{ display: "block", marginTop: 8 }}>
                    Rules come from the account profile (stated, firm, or a cautious default). Empty means AXE does not know that number yet.
                  </p>
                </div>
              </>
            ) : (
              <p className="home-gauge-sub">
                {selectedAccounts[0]?.label} is {selectedAccounts[0]?.kindLabel.toLowerCase()}. The funded suite applies to prop accounts.
                {" "}
                <Link className="home-link" href="/accounts">
                  Manage accounts
                </Link>
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="home-row home-row-3" aria-label="Market pulse">
        <article className="home-card">
          <header className="home-card-h">
            <Link href="/watchlist" className="home-card-title">
              Watchlist
            </Link>
            <span className="grow" />
            <span className="home-badge">{quotes.length ? `${quotes.length} symbols` : "Empty"}</span>
          </header>
          <div className="home-card-b" style={{ paddingTop: 4, paddingBottom: 6 }}>
            {quotes.length === 0 ? (
              <div className="home-empty" style={{ display: "block" }}>
                No symbols yet.{" "}
                <Link className="home-link" href="/watchlist">
                  Add a pair
                </Link>
              </div>
            ) : (
              quotes.map((q) => (
                <Link
                  key={q.symbol}
                  href={`/chart?symbol=${encodeURIComponent(q.displaySymbol)}`}
                  className={`home-wl ${pair === q.displaySymbol ? "is-on" : ""}`}
                >
                  <span className="home-sym">{q.displaySymbol}</span>
                  <span className="home-num" style={{ color: "var(--home-tx-1)", textAlign: "right" }}>
                    {formatPrice(q.price)}
                  </span>
                  <span className={`home-num ${q.changePercent != null ? toneClass(q.changePercent) : "home-mut"}`} style={{ textAlign: "right" }}>
                    {q.changePercent != null ? formatPct(q.changePercent) : q.state === "live" ? "live" : "—"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="home-card">
          <header className="home-card-h">
            <span className="home-card-title">Sessions</span>
            <span className="grow" />
            <span className="home-badge">{openSession ? `${openSession.def.name} open` : "Closed"}</span>
          </header>
          <div className="home-card-b" style={{ gap: 10 }}>
            <div>
              <div
                className="home-timeline"
                title="Session hours are a local cash-session heuristic in each city’s timezone. Not an exchange calendar."
              >
                {timeline.map((b) => (
                  <span
                    key={b.id}
                    className="home-tl-block"
                    style={{ left: `${b.startPct}%`, width: `${b.widthPct}%`, background: b.color }}
                  />
                ))}
                <span className="home-tl-now" style={{ left: `${nowMarkerPct(now, viewZone)}%` }} />
              </div>
              <div className="home-tl-labs">
                <span>00</span>
                <span>08</span>
                <span>16</span>
                <span>24</span>
              </div>
            </div>
            <div className="home-sess-grid">
              {sessions.map(({ def, clock: c }) => (
                <div
                  key={def.id}
                  className={`home-sess-cell ${c.status === "open" ? "is-live" : c.status === "soon" ? "is-soon" : ""}`}
                >
                  <div className="home-cap">{def.name}</div>
                  <div
                    className={`home-num ${c.status === "open" ? "home-up" : c.status === "soon" ? "home-warn" : ""}`}
                    style={{ marginTop: 4, fontSize: 13, color: c.status === "closed" ? "var(--home-tx-2)" : undefined }}
                  >
                    {formatSessionStatusLine(def, c)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="home-card">
          <header className="home-card-h">
            <span className="home-card-title">AXE brief</span>
            <span className="grow" />
            <span className="home-badge">{data.briefTitle ? "Today" : "Empty"}</span>
          </header>
          <div className="home-card-b">
            {data.brief.length === 0 ? (
              <div className="home-empty" style={{ display: "block" }}>
                No morning brief yet.{" "}
                <Link className="home-link" href="/chat">
                  Ask AXE
                </Link>
              </div>
            ) : (
              data.brief.map((item) => (
                <div key={item.k} className={`home-brief-item is-${item.tone}`}>
                  <span className="home-brief-dot" />
                  <div>
                    <div className="home-brief-k">{item.k}</div>
                    <div className="home-brief-v">{item.v}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className={`home-row home-row-3 ${activityExpanded ? "is-expanded" : ""}`} aria-label="Activity">
        <article className={`home-card ${filteredPositions.length === 0 ? "is-empty" : ""} ${activityExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/positions" className="home-card-title">
              Positions &amp; orders
            </Link>
            <span className="grow" />
            <span className="home-badge">
              {openCount} open · {pendCount} pending
            </span>
            {morePositions.length > 0 ? (
              <ExpandBtn expanded={activityExpanded} onClick={() => toggle("activity")} />
            ) : null}
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {positionsHidden ? (
                <p className="home-gauge-sub">
                  Live tickets load for the active account.{" "}
                  <Link className="home-link" href="/accounts">
                    Switch account
                  </Link>
                </p>
              ) : (
                <table className="home-deck">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Size</th>
                      <th>Price</th>
                      <th>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPositions.map((p) => (
                      <PositionRow key={p.id} p={p} />
                    ))}
                    {activityExpanded
                      ? morePositions.map((p) => <PositionRow key={p.id} p={p} />)
                      : null}
                  </tbody>
                </table>
              )}
              {activityExpanded && !positionsHidden ? (
                <div className="home-extra" style={{ display: "block" }}>
                  {filteredPositions
                    .filter((p) => p.extra)
                    .map((p) => (
                      <div key={`${p.id}-x`} style={{ marginTop: 8 }}>
                        <div className="home-cap">{p.symbol}</div>
                        <div className="home-num" style={{ fontSize: 12, marginTop: 3, color: "var(--home-tx-2)" }}>
                          {p.extra}
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
            <div className="home-empty">
              {positionsHidden
                ? "Live positions are shown for the active account."
                : "No open positions or pending orders for this filter."}{" "}
              <Link className="home-link" href="/positions">
                Positions
              </Link>
            </div>
          </div>
        </article>

        <article className={`home-card ${filteredTrades.length === 0 ? "is-empty" : ""} ${activityExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/history" className="home-card-title">
              Trade history
            </Link>
            <span className="grow" />
            <span className="home-badge">
              {filteredTrades.length} {filteredTrades.length === 1 ? "deal" : "deals"}
            </span>
            <ExpandBtn expanded={activityExpanded} onClick={() => toggle("activity")} />
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              <table className="home-deck">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Account</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {previewTrades.map((t) => (
                    <tr key={t.id}>
                      <td className="home-num home-mut">{formatClockTime(t.closeTime)}</td>
                      <td className="home-mut">{t.accountLabel}</td>
                      <td className="home-sym">{t.symbol}</td>
                      <td>
                        <SideTag side={t.side} label={t.side} />
                      </td>
                      <td className={toneClass(t.pnl + t.fees)}>{formatMoney(t.pnl + t.fees, { sign: true })}</td>
                    </tr>
                  ))}
                  {activityExpanded
                    ? moreTrades.map((t) => (
                        <tr key={t.id}>
                          <td className="home-num home-mut">{formatClockTime(t.closeTime)}</td>
                          <td className="home-mut">{t.accountLabel}</td>
                          <td className="home-sym">{t.symbol}</td>
                          <td>
                            <SideTag side={t.side} label={t.side} />
                          </td>
                          <td className={toneClass(t.pnl + t.fees)}>{formatMoney(t.pnl + t.fees, { sign: true })}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
              <p className="home-hint" style={{ marginTop: 8 }}>
                Five most recent deals. Expand to see the rest — the whole row grows together.
              </p>
            </div>
            <div className="home-empty">
              No closed trades for this filter.{" "}
              <Link className="home-link" href="/history">
                History
              </Link>
            </div>
          </div>
        </article>

        <article className={`home-card ${activityExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <span className="home-card-title">Performance</span>
            <span className="grow" />
            <span className="home-badge">Stats</span>
          </header>
          <div className="home-card-b">
            {stats.count === 0 ? (
              <div className="home-empty" style={{ display: "block" }}>
                Stats appear after closed trades land.
              </div>
            ) : (
              <>
                <svg viewBox="0 0 320 88" width="100%" height="88" preserveAspectRatio="none" aria-label="Equity curve">
                  <defs>
                    <linearGradient id="homeEqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2fbf8f" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#2fbf8f" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="70" x2="320" y2="70" stroke="#1b1c1f" strokeWidth="1" />
                  {curve.area ? <path d={curve.area} fill="url(#homeEqFill)" /> : null}
                  {curve.line ? <path d={curve.line} fill="none" stroke="#2fbf8f" strokeWidth="1.6" /> : null}
                </svg>
                <div className="home-cal-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
                  <div>
                    <div className="home-cap">Win rate</div>
                    <div className="home-stat-v">{stats.winRate != null ? `${Math.round(stats.winRate * 100)}%` : "—"}</div>
                  </div>
                  <div>
                    <div className="home-cap">Profit factor</div>
                    <div className="home-stat-v">{stats.profitFactor != null ? stats.profitFactor.toFixed(2) : "—"}</div>
                  </div>
                  <div>
                    <div className="home-cap">Avg</div>
                    <div className={`home-stat-v ${toneClass(stats.avg)}`}>{formatMoney(stats.avg, { sign: true })}</div>
                  </div>
                </div>
                <div className="home-extra">
                  <div className="home-cal-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
                    <div>
                      <div className="home-cap">Total trades</div>
                      <div className="home-stat-v">{stats.count}</div>
                    </div>
                    <div>
                      <div className="home-cap">Best trade</div>
                      <div className={`home-stat-v ${toneClass(stats.best)}`}>{formatMoney(stats.best, { sign: true })}</div>
                    </div>
                    <div>
                      <div className="home-cap">Max DD</div>
                      <div className="home-stat-v">{stats.maxDd != null ? formatMoney(-stats.maxDd, { sign: true }) : "—"}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </article>
      </section>

      <section className={`home-row home-row-2 ${calExpanded ? "is-expanded" : ""}`} aria-label="Trade calendar and wallets">
        <article className={`home-card ${calExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/journal" className="home-card-title">
              Trade calendar
            </Link>
            <span className="grow" />
            <span className="home-badge">
              {firstOfMonth.toLocaleString("en-GB", { month: "long", year: "numeric" })}
            </span>
            <ExpandBtn expanded={calExpanded} onClick={() => toggle("calendar")} />
          </header>
          <div className="home-card-b">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="home-chip"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
                  }
                >
                  ‹
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{firstOfMonth.toLocaleString("en-GB", { month: "long", year: "numeric" })}</span>
                <button
                  type="button"
                  className="home-chip"
                  aria-label="Next month"
                  onClick={() =>
                    setCalCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
                  }
                >
                  ›
                </button>
              </div>
              <span className="home-cap">{accountLabel}</span>
            </div>
            <div className="home-cal-grid" style={{ marginBottom: 3 }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={`${d}-${i}`} className="home-cal-wd">
                  {d}
                </div>
              ))}
            </div>
            <div className="home-cal-grid">
              {Array.from({ length: startPad }, (_, i) => (
                <div key={`e-${i}`} className="home-cal-cell is-empty" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const pnl = monthMap[day];
                const cls = [
                  "home-cal-cell",
                  todayMonth && day === todayDate ? "is-today" : "",
                  pnl > 0 ? "is-up" : pnl < 0 ? "is-dn" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={day} className={cls} title={pnl == null ? `Day ${day}` : `Day ${day} · ${formatMoney(pnl, { sign: true })}`}>
                    <span className="d">{day}</span>
                    {pnl != null ? <span className="p">{pnl > 0 ? "+" : pnl < 0 ? "−" : ""}{Math.abs(Math.round(pnl))}</span> : null}
                  </div>
                );
              })}
            </div>
            <div className="home-cal-stats">
              <div>
                <div className="home-cap">Highest</div>
                <div className={`home-stat-v ${toneClass(monthHi)}`}>{formatMoney(monthHi, { sign: true })}</div>
              </div>
              <div>
                <div className="home-cap">Lowest</div>
                <div className={`home-stat-v ${toneClass(monthLo)}`}>{formatMoney(monthLo, { sign: true })}</div>
              </div>
              <div>
                <div className="home-cap">Month P/L</div>
                <div className={`home-stat-v ${toneClass(monthTot)}`}>{formatMoney(monthTot, { sign: true })}</div>
              </div>
              <div>
                <div className="home-cap">PF</div>
                <div className="home-stat-v">{monthPf != null ? monthPf.toFixed(2) : "—"}</div>
              </div>
            </div>
            <p className="home-hint" style={{ marginTop: 8 }}>
              Green days made money, red days lost. Switch account or pair above — this calendar follows both.
            </p>
          </div>
        </article>

        <article className="home-card">
          <header className="home-card-h">
            <Link href="/wallets" className="home-card-title">
              Wallets
            </Link>
            <span className="grow" />
            <span className="home-badge">{wallets.length ? `${wallets.length}` : "None"}</span>
          </header>
          <div className="home-card-b">
            {wallets.length === 0 ? (
              <div className="home-empty" style={{ display: "block" }}>
                No wallets tracked yet.{" "}
                <Link className="home-link" href="/wallets">
                  Add a wallet
                </Link>
              </div>
            ) : (
              wallets.map((w) => (
                <div key={w.id} className="home-wallet">
                  <div className="home-w-ico">{(w.chain || w.label).slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="home-w-name">{w.label}</div>
                    <div className="home-w-addr">{shortAddress(w.address)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="home-num" style={{ fontSize: 13, fontWeight: 600, color: "var(--home-tx-1)" }}>
                      {w.nativeAmount != null
                        ? `${w.nativeAmount} ${w.nativeSymbol ?? ""}`.trim()
                        : formatMoney(w.usdEstimate)}
                    </div>
                    {w.usdEstimate != null && w.nativeAmount != null ? (
                      <div className="home-mut home-num" style={{ fontSize: 11, marginTop: 3 }}>
                        {formatMoney(w.usdEstimate)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            <Link href="/wallets" className="home-link" style={{ marginTop: 8 }}>
              + Add wallet
            </Link>
          </div>
        </article>
      </section>

      <section className={`home-row home-row-3 ${newsExpanded ? "is-expanded" : ""}`} aria-label="Market context">
        <article className={`home-card ${filteredNews.length === 0 ? "is-empty" : ""} ${newsExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/market" className="home-card-title">
              News
            </Link>
            <span className="grow" />
            <span className="home-badge">{filteredNews.length ? "Live" : "Empty"}</span>
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {(newsExpanded ? filteredNews : previewNews).map((n) => (
                <a key={n.id} className="home-news" href={n.url} target="_blank" rel="noreferrer">
                  <span
                    className={`home-sent ${n.sentiment != null && n.sentiment > 0.15 ? "bull" : n.sentiment != null && n.sentiment < -0.15 ? "bear" : ""}`}
                  />
                  <div>
                    <div className="home-news-t">{n.title}</div>
                    <div className="home-news-m">
                      {n.source}
                      {n.publishedAt ? ` · ${relativeTime(n.publishedAt, now.getTime())}` : ""}
                    </div>
                  </div>
                </a>
              ))}
              {moreNews.length > 0 || moreEvents.length > 0 ? (
                <button type="button" className="home-expand" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={() => toggle("news")}>
                  {newsExpanded
                    ? "Collapse"
                    : `+${moreNews.length + moreEvents.length} more`}
                </button>
              ) : null}
            </div>
            <div className="home-empty">
              No headlines for this filter.{" "}
              <Link className="home-link" href="/market">
                Market
              </Link>
            </div>
          </div>
        </article>

        <article className={`home-card ${filteredEvents.length === 0 ? "is-empty" : ""}`}>
          <header className="home-card-h">
            <Link href="/market" className="home-card-title">
              Calendar
            </Link>
            <span className="grow" />
            <span className="home-badge">This week</span>
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {(newsExpanded ? filteredEvents : previewEvents).map((e) => (
                <div key={e.id} className="home-news" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span className="home-num home-mut" style={{ fontSize: 11 }}>
                    {formatClockTime(e.startsAt)}
                  </span>
                  <div>
                    <div className="home-news-t">{e.title}</div>
                    <div className="home-news-m">{[e.currency, e.country].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span
                    className={`home-cap ${e.impact === "high" ? "home-dn" : e.impact === "medium" ? "home-warn" : ""}`}
                  >
                    {e.impact}
                  </span>
                </div>
              ))}
            </div>
            <div className="home-empty">No events tagged for this filter this week.</div>
          </div>
        </article>

        <article className={`home-card ${data.macro.length === 0 ? "is-empty" : ""}`}>
          <header className="home-card-h">
            <Link href="/market" className="home-card-title">
              Macro
            </Link>
            <span className="grow" />
            <span className="home-badge">Latest print</span>
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {data.macro.map((m) => (
                <div key={m.id} className="home-wl" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>{m.label}</span>
                  <span className="home-num" style={{ color: "var(--home-tx-1)" }}>
                    {m.value != null ? `${m.value}${m.units === "%" ? "%" : m.units ? ` ${m.units}` : ""}` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="home-empty">Macro prints appear when FRED is connected.</div>
          </div>
        </article>
      </section>

      <section className="home-row home-row-2" aria-label="Assistant and alerts">
        <article className={`home-card ${data.steps.length === 0 ? "is-empty" : ""}`}>
          <header className="home-card-h">
            <Link href="/chat" className="home-card-title">
              AXE · next steps
            </Link>
            <span className="grow" />
            <span className="home-badge">Suggestions</span>
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {data.steps.map((s, i) => (
                <div key={s.id} className="home-step">
                  <span className="home-step-n">{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--home-tx-1)" }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "var(--home-tx-3)", marginTop: 2 }}>{s.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="home-empty">
              AXE will suggest next steps as you trade and journal.{" "}
              <Link className="home-link" href="/chat">
                Open Chat
              </Link>
            </div>
          </div>
        </article>

        <article className={`home-card ${filteredAlerts.length === 0 ? "is-empty" : ""} ${alertsExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/alerts" className="home-card-title">
              Alerts
            </Link>
            <span className="grow" />
            <span className="home-badge">{filteredAlerts.length || "0"}</span>
            {moreAlerts.length > 0 ? (
              <ExpandBtn expanded={alertsExpanded} onClick={() => toggle("alerts")} />
            ) : null}
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {(alertsExpanded ? filteredAlerts : previewAlerts).map((a) => (
                <div key={a.id} className="home-news" style={{ gridTemplateColumns: "6px 1fr auto" }}>
                  <span className={`home-sent ${a.triggeredAt ? "bull" : ""}`} />
                  <div>
                    <div className="home-news-t">{a.title}</div>
                    <div className="home-news-m">{a.subtitle}</div>
                  </div>
                  <span className="home-num home-mut" style={{ fontSize: 11 }}>
                    {formatClockTime(a.triggeredAt ?? a.createdAt)}
                  </span>
                </div>
              ))}
              {moreAlerts.length > 0 && !alertsExpanded ? (
                <p className="home-hint" style={{ display: "block", marginTop: 8 }}>
                  +{moreAlerts.length} more — expand in place, or open Alerts.
                </p>
              ) : null}
            </div>
            <div className="home-empty">
              No alerts yet.{" "}
              <Link className="home-link" href="/alerts">
                Create one
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className={`home-row home-row-2 ${journalExpanded ? "is-expanded" : ""}`} aria-label="Journal and tools">
        <article className={`home-card ${filteredJournal.length === 0 ? "is-empty" : ""} ${journalExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <Link href="/journal" className="home-card-title">
              Journal
            </Link>
            <span className="grow" />
            <span className="home-badge">
              {filteredJournal.length} {filteredJournal.length === 1 ? "note" : "notes"}
            </span>
            {moreJournal.length > 0 ? (
              <ExpandBtn expanded={journalExpanded} onClick={() => toggle("journal")} />
            ) : null}
          </header>
          <div className="home-card-b" style={{ paddingTop: 4 }}>
            <div className="home-has-rows">
              {(journalExpanded ? filteredJournal : previewJournal).map((j) => (
                <div key={j.id} className="home-j-item">
                  <span className="home-j-tag">{j.tag || j.symbol || "Note"}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--home-tx-1)" }}>{j.title}</div>
                    {j.body ? <div style={{ fontSize: 11, color: "var(--home-tx-3)", marginTop: 2 }}>{j.body.slice(0, 120)}</div> : null}
                  </div>
                  <span className="home-num home-mut" style={{ fontSize: 11 }}>
                    {formatClockTime(j.createdAt) !== "—" ? formatClockTime(j.createdAt) : relativeTime(j.createdAt, now.getTime())}
                  </span>
                </div>
              ))}
            </div>
            <div className="home-empty">
              No journal notes for this pair.{" "}
              <Link className="home-link" href="/journal">
                Open journal
              </Link>
            </div>
          </div>
        </article>

        <article className={`home-card ${journalExpanded ? "is-expanded" : ""}`}>
          <header className="home-card-h">
            <span className="home-card-title">Tools</span>
            <span className="grow" />
            <span className="home-badge">Calculators</span>
          </header>
          <div className="home-card-b">
            <div className="home-chips" style={{ marginBottom: 10 }}>
              <span className="home-chip is-on">Risk : Reward</span>
            </div>
            <div className="home-calc-grid">
              <label>
                <div className="home-field-lab">Entry</div>
                <input
                  className="home-field-box"
                  value={calc.entry}
                  onChange={(e) => setCalc((c) => ({ ...c, entry: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                <div className="home-field-lab">Stop loss</div>
                <input
                  className="home-field-box"
                  value={calc.sl}
                  onChange={(e) => setCalc((c) => ({ ...c, sl: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                <div className="home-field-lab">Take profit</div>
                <input
                  className="home-field-box"
                  value={calc.tp}
                  onChange={(e) => setCalc((c) => ({ ...c, tp: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
            <div className="home-calc-out">
              <div className="home-out-box">
                <div className="home-field-lab">Risk</div>
                <div className="home-num home-warn" style={{ fontSize: 13, fontWeight: 600 }}>
                  {riskDist != null ? riskDist.toFixed(2) : "—"}
                </div>
              </div>
              <div className="home-out-box">
                <div className="home-field-lab">Reward</div>
                <div className="home-num home-up" style={{ fontSize: 13, fontWeight: 600 }}>
                  {rewardDist != null ? rewardDist.toFixed(2) : "—"}
                </div>
              </div>
              <div className="home-out-box">
                <div className="home-field-lab">R:R</div>
                <div className="home-num home-accent" style={{ fontSize: 13, fontWeight: 600 }}>
                  {rr != null ? `1 : ${rr.toFixed(2)}` : "—"}
                </div>
              </div>
              <div className="home-out-box">
                <div className="home-field-lab">Breakeven</div>
                <div className="home-num" style={{ fontSize: 13, fontWeight: 600 }}>
                  {breakeven != null ? breakeven.toFixed(2) : "—"}
                </div>
              </div>
            </div>
            <p className="home-hint" style={{ display: "block", marginTop: 8 }}>
              Distances in price. Seeded from the first open ticket when you have one. Dollar size needs the broker contract — that lives on Positions.
            </p>
          </div>
        </article>
      </section>

      {openSession && openSession.clock.minutesUntilClose != null && openSession.clock.minutesUntilClose <= 90 ? (
        <p className="home-mut" style={{ fontSize: 11, padding: "0 2px" }}>
          {openSession.def.name} closes in {formatCountdown(openSession.clock.minutesUntilClose)}.
        </p>
      ) : null}
    </div>
  );
}

function PositionRow({ p }: { p: HomePosition }) {
  return (
    <tr>
      <td className="home-sym">{p.symbol}</td>
      <td>
        <SideTag side={p.side} label={p.sideLabel} />
      </td>
      <td className="home-num">{p.volume}</td>
      <td className="home-num">{formatPrice(p.openPrice ?? p.currentPrice)}</td>
      <td>
        {p.pnl == null ? <span className="home-mut">Pending</span> : <span className={toneClass(p.pnl)}>{formatMoney(p.pnl, { sign: true })}</span>}
      </td>
    </tr>
  );
}
