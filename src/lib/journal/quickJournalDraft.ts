import { formatSignedMoney, netPnl } from "@/lib/journal/tradePnl";
import type { ActiveSessionState } from "@/lib/session/activeSession";

export type QuickJournalAxeDraft = {
  axeLabel: string | null;
  axeNote: string | null;
  alignmentScore: number | null;
  explanation: string | null;
};

export type QuickJournalDraft = {
  tradeId: string;
  accountId: string;
  accountLabel: string | null;
  accountType: string | null;
  symbol: string;
  side: string;
  volume: number;
  openPrice: number | null;
  closePrice: number | null;
  openTime: string | null;
  closeTime: string | null;
  pnl: number;
  fees: number;
  netPnl: number;
  label: string | null;
  note: string | null;
  axe: QuickJournalAxeDraft;
};

export type QuickJournalTradeInput = {
  id: string;
  accountId: string;
  symbol: string;
  side: string;
  volume?: number | null;
  openPrice?: number | null;
  closePrice?: number | null;
  openTime?: string | null;
  closeTime?: string | null;
  pnl: number;
  fees?: number | null;
  label?: string | null;
  note?: string | null;
  axe_label?: string | null;
  axe_note?: string | null;
  alignment_score?: number | null;
  axe_journal?: { explanation?: string | null } | null;
};

export function buildQuickJournalDraft(
  trade: QuickJournalTradeInput,
  session?: Pick<ActiveSessionState, "accountId" | "accountLabel" | "accountType"> | null,
): QuickJournalDraft {
  const fees = Number(trade.fees ?? 0) || 0;
  const sameAccount = Boolean(session?.accountId && session.accountId === trade.accountId);
  return {
    tradeId: trade.id,
    accountId: trade.accountId,
    accountLabel: sameAccount ? session?.accountLabel ?? null : null,
    accountType: sameAccount ? session?.accountType ?? null : null,
    symbol: (trade.symbol ?? "").toUpperCase(),
    side: (trade.side ?? "").toLowerCase(),
    volume: Number(trade.volume ?? 0) || 0,
    openPrice: trade.openPrice ?? null,
    closePrice: trade.closePrice ?? null,
    openTime: trade.openTime ?? null,
    closeTime: trade.closeTime ?? null,
    pnl: Number(trade.pnl ?? 0) || 0,
    fees,
    netPnl: netPnl(trade.pnl, fees),
    label: trade.label ?? null,
    note: trade.note ?? null,
    axe: {
      axeLabel: trade.axe_label ?? null,
      axeNote: trade.axe_note ?? null,
      alignmentScore: trade.alignment_score ?? null,
      explanation: trade.axe_journal?.explanation ?? trade.axe_note ?? null,
    },
  };
}

export function applySessionAccount(
  draft: QuickJournalDraft,
  session: Pick<ActiveSessionState, "accountId" | "accountLabel" | "accountType">,
): QuickJournalDraft {
  if (!session.accountId || session.accountId !== draft.accountId) return draft;
  return {
    ...draft,
    accountLabel: session.accountLabel ?? draft.accountLabel,
    accountType: session.accountType ?? draft.accountType,
  };
}

export function formatPrice(n: number | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function priceDigits(p: number | null): number {
  if (!p) return 2;
  if (p > 100) return 2;
  if (p > 10) return 3;
  return 5;
}

export function formatDraftPnl(draft: QuickJournalDraft): string {
  return formatSignedMoney(draft.netPnl);
}

export function directionLabel(side: string): "Buy" | "Sell" | string {
  const s = side.toLowerCase();
  if (s === "buy") return "Buy";
  if (s === "sell") return "Sell";
  return side || "—";
}
