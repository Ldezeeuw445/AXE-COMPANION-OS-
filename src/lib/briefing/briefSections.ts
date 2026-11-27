/**
 * Pure pieces of the morning brief: which markets it prices, the
 * server-written MARKET STATUS / YOUR ACCOUNTS sections and the section
 * header list. Kept out of axeDailyBriefingService (server-only) so the
 * guard tests and the dry-run sample script can run them.
 */

import { describeMarketStatus, type MarketStatusSummary } from "@/lib/market/marketHours";
import { formatAccountLines, type AccountDigest } from "@/lib/briefing/accountsDigest";

type StatusCtx = { marketStatus: MarketStatusSummary; timezone: string };

export const BRIEF_SECTION_HEADERS = new Set([
  "MARKET STATUS",
  "YOUR ACCOUNTS",
  "WEEK AHEAD",
  "MARKET OUTLOOK",
  "NEWS",
  "RECENT PERFORMANCE",
  "ALIGNMENT SCORE",
  "ACTION ITEMS",
  "WATCH THIS SESSION",
  "SESSION WATCH",
  "SESSION FOCUS",
  "TODAY'S WATCH",
]);

export function normalizeBriefHeader(line: string): string {
  return line.trim().replace(/:+$/, "").toUpperCase();
}

/** Every market in the brief except crypto is closed (weekend, Christmas …). */
export function briefIsClosedMarketDay(context: Pick<StatusCtx, "marketStatus">): boolean {
  const st = context.marketStatus;
  if (st.tradFiWeekend) return true;
  const nonCrypto = st.statuses.filter((s) => s.assetClass !== "crypto");
  return nonCrypto.length > 0 && nonCrypto.every((s) => !s.open && (s.reason === "weekend" || s.reason === "holiday"));
}

/** Deterministic MARKET STATUS lines (server-written, never the model's). */
export function marketStatusLines(context: StatusCtx): string[] {
  return context.marketStatus.statuses.map((s) => describeMarketStatus(s, context.timezone));
}

/**
 * The markets a brief prices: theirs, in focus order, at most five.
 *
 * This used to add XAUUSD and BTCUSD to every brief "because AXE gets asked
 * about them most" — which is why every trader's brief was about gold and
 * bitcoin whatever they had chosen.
 */
export function briefPriceSymbols(preferredPairs: string[]): string[] {
  const out: string[] = [];
  for (const s of preferredPairs) {
    const up = s.trim().toUpperCase();
    if (up && !out.includes(up)) out.push(up);
    if (out.length >= 5) break;
  }
  return out;
}

/** Put a server-written section before `beforeHeader` (or after the greeting). */
export function insertBriefSection(body: string, header: string, lines: string[], beforeHeader: string[]): string {
  if (lines.length === 0) return body;
  const block = `${header}\n${lines.join("\n")}`;
  const src = body.replace(/\r\n/g, "\n").trim();
  const rows = src.split("\n");
  // Drop a section the model wrote anyway under the same header.
  const own = rows.findIndex((l) => normalizeBriefHeader(l) === header);
  if (own !== -1) {
    let end = rows.length;
    for (let i = own + 1; i < rows.length; i++) {
      if (BRIEF_SECTION_HEADERS.has(normalizeBriefHeader(rows[i] ?? ""))) {
        end = i;
        break;
      }
    }
    rows.splice(own, end - own);
  }
  const at = rows.findIndex((l) => beforeHeader.includes(normalizeBriefHeader(l)));
  if (at !== -1) {
    rows.splice(at, 0, block, "");
  } else {
    const greetEnd = rows.findIndex((l, i) => i > 0 && l.trim() === "");
    rows.splice(greetEnd === -1 ? rows.length : greetEnd + 1, 0, block, "");
  }
  return rows.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * MARKET STATUS and YOUR ACCOUNTS are written by the server from the same
 * numbers the prompt saw — the model cannot change a reopen time or a room.
 */
export function withServerSections(
  body: string,
  context: StatusCtx & { accounts: AccountDigest[] },
): string {
  const statusLines = marketStatusLines(context);
  const showStatus = statusLines.length > 0 && (context.marketStatus.closed.length > 0 || context.marketStatus.holiday);
  let out = showStatus ? insertBriefSection(body, "MARKET STATUS", statusLines, ["MARKET OUTLOOK"]) : body;
  const accountLines = formatAccountLines(context.accounts, context.timezone);
  out = insertBriefSection(
    out,
    "YOUR ACCOUNTS",
    accountLines.length ? accountLines : ["No linked accounts yet — connect one under Accounts."],
    ["ALIGNMENT SCORE", "ACTION ITEMS"],
  );
  return out;
}

