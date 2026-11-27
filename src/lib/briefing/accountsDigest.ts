/**
 * Every linked account, in numbers that match the Trading OS funded suite.
 *
 * The brief only ever looked at the active account (and mostly at none: it
 * listed closed trades and an alignment score), and AXE chat had no account
 * rules at all — asked for a risk overview of "100K 1STEP UPCOMERS" it wrote
 * "daily loss $1,800.75, remaining daily limit $1,146.25, max allowable loss
 * $9,823.33": 3% and 10% of an equity figure it picked itself. The funded
 * suite in Trading OS said 294.45 used of a 3,000 daily limit and 3,473.97
 * room left of 6,000 max drawdown — the Upcomers Thunderbolt rule (3% daily
 * from the higher of balance/equity at 00:00 UTC, 6% trailing, both of the
 * $100k account size).
 *
 * One source of truth: the program Trading OS assigned
 * (metadata.tosProgramId) resolved through SHARED_PROP_PROGRAMS — a verbatim
 * copy of the TOS catalog — and the same formulas as trading-core's
 * evaluate.ts. Without a TOS program, the rules the trader stated in
 * Companion (metadata.tradingRules) are used and labelled as such. Without
 * either, no limit is shown — never a guessed one.
 *
 * Read-only and display-only: the order guard does not use this file.
 * Dependency-free apart from the two pure risk helpers (node --test).
 */

import { statedAccountSize } from "@/lib/risk/dailyLoss";
import { SHARED_PROP_PROGRAMS, type SharedPropProgram } from "@/lib/risk/sharedPropPrograms";

export type AccountRow = {
  id: string;
  label: string | null;
  status: string | null;
  server: string | null;
  metadata: Record<string, unknown> | null;
};

export type PositionRow = {
  account_id: string;
  symbol: string;
  type: string;
  volume: number;
  profit: number | null;
  swap?: number | null;
  stop_loss: number | null;
  take_profit: number | null;
};

export type AccountDigest = {
  id: string;
  name: string;
  kind: "prop" | "live" | "paper";
  currency: string;
  equity: number | null;
  balance: number | null;
  asOf: string | null;
  stale: boolean;
  dayStart: number | null;
  dayPnl: number | null;
  rulesSource: "trading_os_program" | "companion_stated" | "none";
  programLabel: string | null;
  accountSize: number | null;
  daily: { limit: number; used: number; room: number; pct: number; reset: string | null } | null;
  maxDd: { limit: number; used: number; room: number; pct: number; kind: string } | null;
  notes: string[];
  openPositions: Array<{ symbol: string; side: string; volume: number; profit: number | null; sl: number | null; tp: number | null }>;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "100K 1STEP UPCOMERS" → 100000; "$50,000 Challenge" → 50000. */
export function sizeFromLabel(label: string | null | undefined): number | null {
  const s = String(label ?? "").toUpperCase();
  const k = s.match(/\b(\d{1,4}(?:\.\d+)?)\s?K\b/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const plain = s.match(/\$?\b(\d{1,3}(?:[,.]\d{3})+)\b/);
  if (plain) return Number(plain[1].replace(/[,.]/g, ""));
  return null;
}

/** Last firm reset at or before `now` for "UTC 00:00" / "Europe/Prague 00:00" style specs. */
export function lastResetAt(spec: string | null, now: Date): Date | null {
  const m = String(spec ?? "").match(/^([A-Za-z_/]+|UTC)\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const tz = m[1] === "UTC" ? "UTC" : m[1];
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  try {
    // Walk back in 15-minute steps until the local clock reads hh:mm (≤ 25 h).
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const step = 15 * 60 * 1000;
    let t = Math.floor(now.getTime() / step) * step;
    for (let i = 0; i < 25 * 4 + 1; i += 1, t -= step) {
      const [h, mi] = fmt.format(new Date(t)).split(":").map(Number);
      if (h === hh && mi === mm) return new Date(t);
    }
  } catch {
    return null;
  }
  return null;
}

const STALE_MS = 20 * 60 * 1000;

export function digestAccount(row: AccountRow, positions: PositionRow[], now: Date, opts: { marketsOpen: boolean }): AccountDigest {
  const meta = rec(row.metadata);
  const live = rec(meta.liveAccountState);
  const isPaper = meta.demo === true && !live.equity;
  const equity = num(live.equity) ?? num(meta.equity);
  const balance = num(live.balance) ?? num(meta.balance);
  const asOf = typeof live.updatedAt === "string" ? live.updatedAt : null;
  const ageMs = asOf ? now.getTime() - Date.parse(asOf) : null;
  const stale = !isPaper && opts.marketsOpen && (ageMs == null || ageMs > STALE_MS);
  const notes: string[] = [];

  const programId = typeof meta.tosProgramId === "string" ? meta.tosProgramId : null;
  const program: SharedPropProgram | null = programId ? SHARED_PROP_PROGRAMS[programId] ?? null : null;
  const stated = rec(meta.tradingRules);
  const accountSize = statedAccountSize(meta) ?? sizeFromLabel(row.label);

  let rulesSource: AccountDigest["rulesSource"] = "none";
  let dailyPct: number | null = null;
  let dailyUsd: number | null = null;
  let maxPct: number | null = null;
  let maxUsd: number | null = null;
  let maxKind = "static";
  let anchor: string = "equity";
  let reset: string | null = null;
  let programLabel: string | null = null;
  if (program) {
    rulesSource = "trading_os_program";
    dailyPct = program.dailyPct;
    dailyUsd = program.dailyUsd;
    maxPct = program.maxPct;
    maxUsd = program.maxUsd;
    maxKind = program.maxKind ?? "static";
    anchor = program.dailyAnchor ?? "higher_of_balance_equity";
    reset = program.dailyReset;
    programLabel = `${program.firmName} ${program.program} · ${program.phaseLabel}`;
    // A stated cap may only tighten the firm's (same rule as TOS clampUserCaps).
    const sd = num(stated.maxDailyLossPct);
    const sm = num(stated.maxTotalLossPct);
    if (sd != null && dailyPct != null && sd < dailyPct) dailyPct = sd;
    if (sm != null && maxPct != null && sm < maxPct) maxPct = sm;
  } else if (num(stated.maxDailyLossPct) != null || num(stated.maxTotalLossPct) != null) {
    rulesSource = "companion_stated";
    dailyPct = num(stated.maxDailyLossPct);
    maxPct = num(stated.maxTotalLossPct);
    programLabel = typeof meta.firmModel === "string" ? meta.firmModel : null;
  } else if (programId) {
    notes.push(`program ${programId} is not in the shared catalog — no limits shown`);
  }

  // Start of the firm's day.
  const dsBal = num(live.dayStartBalance);
  const dsEq = num(live.dayStartEquity);
  const dsAt = typeof live.dayStartAt === "string" ? Date.parse(live.dayStartAt) : NaN;
  let dayStart: number | null = null;
  if (dsBal != null || dsEq != null) {
    const b = dsBal ?? dsEq!;
    const e = dsEq ?? dsBal!;
    dayStart = anchor === "balance" ? b : anchor === "equity" ? e : Math.max(b, e);
    const resetAt = lastResetAt(reset, now);
    let fresh = true;
    if (resetAt && Number.isFinite(dsAt)) {
      fresh = Math.abs(dsAt - resetAt.getTime()) <= 3 * 60 * 60 * 1000;
    } else if (!Number.isFinite(dsAt) || now.getTime() - dsAt > 26 * 60 * 60 * 1000) {
      fresh = false;
    }
    if (!fresh) {
      dayStart = null;
      if (opts.marketsOpen) notes.push("no start-of-day snapshot from today's firm reset — daily room unknown");
    }
  }
  const positionsHere = positions.filter((p) => p.account_id === row.id);
  const dayPnl = dayStart != null && equity != null ? equity - dayStart : null;

  let daily: AccountDigest["daily"] = null;
  if ((dailyPct != null || dailyUsd != null) && equity != null && dayStart != null) {
    const limit = dailyUsd ?? (accountSize != null && dailyPct != null ? (dailyPct / 100) * accountSize : null);
    if (limit != null) {
      const used = Math.max(0, dayStart - equity);
      daily = { limit, used, room: Math.max(0, limit - used), pct: dailyPct ?? (limit / (accountSize ?? limit)) * 100, reset };
    } else notes.push("account size unknown — set it in Settings → Account rules");
  } else if ((dailyPct != null || dailyUsd != null) && dayStart == null && !opts.marketsOpen) {
    // Weekend / holiday: no trading day is running. The daily limit starts
    // fresh from the balance at the reopen — unless positions are held, in
    // which case the gap decides where it starts.
    const limit = dailyUsd ?? (accountSize != null && dailyPct != null ? (dailyPct / 100) * accountSize : null);
    if (limit != null) {
      notes.push(
        positionsHere.length
          ? `markets closed — daily limit ${limit.toLocaleString("en-US", { style: "currency", currency: "USD" })} restarts at the reopen; held positions carry gap risk`
          : `markets closed — full daily room of ${limit.toLocaleString("en-US", { style: "currency", currency: "USD" })} at the reopen`,
      );
    }
  }

  let maxDd: AccountDigest["maxDd"] = null;
  if ((maxPct != null || maxUsd != null) && equity != null && accountSize != null) {
    const limit = maxUsd ?? (maxPct! / 100) * accountSize;
    let used: number;
    if (maxKind === "trailing" || maxKind === "eod_trailing") {
      const hwm = Math.max(accountSize, equity, num(live.peakBalance) ?? 0, balance ?? 0);
      used = Math.max(0, hwm - equity);
    } else {
      used = Math.max(0, accountSize - equity);
    }
    maxDd = { limit, used, room: Math.max(0, limit - used), pct: maxPct ?? (limit / accountSize) * 100, kind: maxKind };
  }

  const firmish = Boolean(program) || /challenge|funded|prop|step|upcomers|ftmo|fundednext|the5ers|goat/i.test(`${row.label ?? ""} ${row.server ?? ""}`);
  return {
    id: row.id,
    name: row.label?.trim() || (isPaper ? "AXE Paper" : String(meta.description ?? "Account")),
    kind: isPaper ? "paper" : firmish ? "prop" : "live",
    currency: String(live.currency ?? meta.currency ?? "USD"),
    equity,
    balance,
    asOf,
    stale,
    dayStart,
    dayPnl,
    rulesSource,
    programLabel,
    accountSize,
    daily,
    maxDd,
    notes,
    openPositions: positionsHere
      .map((p) => ({
        symbol: p.symbol,
        side: /sell/i.test(p.type) ? "SELL" : "BUY",
        volume: Number(p.volume),
        profit: num(p.profit),
        sl: num(p.stop_loss),
        tp: num(p.take_profit),
      })),
  };
}

const money = (n: number | null, ccy = "USD") =>
  n == null ? "—" : `${n < 0 ? "-" : ""}${ccy === "USD" ? "$" : `${ccy} `}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtTime(iso: string | null, timezone: string): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** One line per account + its positions — the exact text the brief prints and the prompt sees. */
export function formatAccountLines(accounts: AccountDigest[], timezone: string): string[] {
  const lines: string[] = [];
  for (const a of accounts) {
    const head = `${a.name}${a.programLabel ? ` (${a.programLabel})` : a.kind === "paper" ? " (paper)" : ""}`;
    const parts = [`equity ${money(a.equity, a.currency)}`];
    if (a.dayPnl != null) parts.push(`today ${a.dayPnl >= 0 ? "+" : ""}${money(a.dayPnl, a.currency)}`);
    if (a.daily) parts.push(`daily room ${money(a.daily.room, a.currency)} of ${money(a.daily.limit, a.currency)}`);
    if (a.maxDd) parts.push(`max DD room ${money(a.maxDd.room, a.currency)} of ${money(a.maxDd.limit, a.currency)}`);
    if (!a.daily && !a.maxDd && a.rulesSource === "none" && a.kind !== "paper") parts.push("no prop rules set");
    parts.push(a.openPositions.length ? `${a.openPositions.length} open` : "no open positions");
    const sync = a.kind === "paper" ? "" : ` · as of ${fmtTime(a.asOf, timezone)}${a.stale ? " (stale)" : ""}`;
    lines.push(`${head}: ${parts.join(" · ")}${sync}`);
    for (const p of a.openPositions.slice(0, 6)) {
      lines.push(
        `  ${p.symbol} ${p.side} ${p.volume} lot · P/L ${money(p.profit, a.currency)} · SL ${p.sl ?? "none"} · TP ${p.tp ?? "none"}`,
      );
    }
    for (const n of a.notes) lines.push(`  note: ${n}`);
  }
  return lines;
}

export function formatAccountsPromptBlock(accounts: AccountDigest[], timezone: string): string {
  if (accounts.length === 0) return "ACCOUNTS: none linked — do not talk about account balances or limits.";
  return `ACCOUNTS (all ${accounts.length} linked accounts — computed, the ONLY account numbers you may use; never compute your own limits):\n${formatAccountLines(accounts, timezone)
    .map((l) => `- ${l.trimStart()}`)
    .join("\n")}`;
}

/** Highlight row stored with the brief so the feed card can render the accounts table. */
export type BriefAccountsHighlight = {
  type: "accounts";
  checkedAt: string;
  accounts: Array<Pick<AccountDigest, "id" | "name" | "kind" | "currency" | "equity" | "dayPnl" | "daily" | "maxDd" | "asOf" | "stale" | "programLabel" | "rulesSource"> & { open: number }>;
};

export function toAccountsHighlight(accounts: AccountDigest[], now: Date): BriefAccountsHighlight {
  return {
    type: "accounts",
    checkedAt: now.toISOString(),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      equity: a.equity,
      dayPnl: a.dayPnl,
      daily: a.daily,
      maxDd: a.maxDd,
      asOf: a.asOf,
      stale: a.stale,
      programLabel: a.programLabel,
      rulesSource: a.rulesSource,
      open: a.openPositions.length,
    })),
  };
}
