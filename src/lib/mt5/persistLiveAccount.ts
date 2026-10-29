import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChartLiveEvent, LivePositionPayload } from "@/lib/chart/liveContract";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { evaluateDrawdownAlerts } from "@/lib/risk/drawdownAlert";
import { renderNoticeBody } from "@/lib/axe/notice";
import { syncWriteClient } from "@/lib/supabase/syncWriteClient";
import {
  figuresFromAccountInfo,
  liveEquitySnapshotFromMetadata,
  nextLiveAccountState,
  toMt5PositionRow,
  type LiveAccountFigures,
} from "@/lib/mt5/liveAccountSnapshot";

/**
 * mt5_positions and axe_proactive_events have no INSERT policy for signed-in
 * users, so these writes have always needed the elevated client. Shared with
 * the deal-history sync now — see `syncWriteClient` for the two rules that
 * keep an RLS-bypassing write owner-scoped.
 */
const writerFor = syncWriteClient;

const persistAt = new Map<string, number>();
const PERSIST_MIN_MS = 2_000;

export function shouldPersistAccount(accountId: string, now = Date.now()): boolean {
  const prev = persistAt.get(accountId) ?? 0;
  if (now - prev < PERSIST_MIN_MS) return false;
  persistAt.set(accountId, now);
  return true;
}

export async function replaceMt5Positions(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  positions: LivePositionPayload[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("mt5_positions")
    .delete()
    .eq("user_id", userId)
    .eq("account_id", String(accountId));
  if (delErr) {
    console.warn("[live-account] position delete failed:", delErr.message);
    return;
  }
  if (positions.length === 0) return;
  const rows = positions.map((p) => toMt5PositionRow(userId, accountId, p));
  const { error: inErr } = await supabase.from("mt5_positions").insert(rows);
  if (inErr) console.warn("[live-account] position insert failed:", inErr.message);
}

export async function persistLiveFiguresAndPositions(
  supabase: SupabaseClient,
  input: {
    userId: string;
    accountId: string;
    figures?: LiveAccountFigures | null;
    positions?: LivePositionPayload[] | null;
    force?: boolean;
  },
): Promise<void> {
  if (!input.force && !shouldPersistAccount(input.accountId)) return;

  const { data: account, error } = await supabase
    .from("user_broker_accounts")
    .select("id,user_id,label,mt5_server,metadata,connection_method")
    .eq("id", input.accountId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !account) return;

  const prevMeta = (account.metadata ?? {}) as Record<string, unknown>;
  let nextMeta = prevMeta;
  if (input.figures && (input.figures.equity != null || input.figures.balance != null)) {
    nextMeta = nextLiveAccountState(prevMeta, input.figures);
  }
  if (input.positions !== undefined && input.positions !== null) {
    nextMeta = { ...nextMeta, openPositions: input.positions, lastLivePositionsAt: new Date().toISOString() };
  }

  // Do not stamp last_sync_at here. That column is the 10-minute deal-history
  // sync; touching it on every equity tick would skip the backup cron and
  // closed trades would never land in broker_trades.
  const writer = writerFor(supabase);
  const { error: upErr } = await writer
    .from("user_broker_accounts")
    .update({ metadata: nextMeta })
    .eq("id", input.accountId)
    .eq("user_id", input.userId);
  if (upErr) {
    console.warn("[live-account] metadata update failed:", upErr.message);
  }

  if (input.positions !== undefined && input.positions !== null) {
    await replaceMt5Positions(writer, input.userId, input.accountId, input.positions);
  }

  const figures = input.figures ?? figuresFromAccountInfo(
    (nextMeta.liveAccountState as Record<string, unknown> | undefined) ??
      (nextMeta.accountSummary as Record<string, unknown> | undefined),
  );
  const snap = liveEquitySnapshotFromMetadata(nextMeta, figures);
  if (!snap) return;

  const profile = buildAccountProfile({
    label: (account.label as string | null) ?? null,
    mt5Server: (account.mt5_server as string | null) ?? null,
    metadata: nextMeta,
    connectionMethod: (account.connection_method as string | null) ?? null,
  });
  const alerts = evaluateDrawdownAlerts({
    accountId: input.accountId,
    constraints: profile,
    snap,
  });
  for (const alert of alerts) {
    await recordProactiveFeedEvent(
      writer,
      input.userId,
      alert.eventKey,
      alert.notice.title,
      renderNoticeBody(alert.notice),
      alert.notice.action.href,
      { category: "risk_alert" },
    );
  }
}

export async function persistChartLiveEvent(
  supabase: SupabaseClient,
  event: ChartLiveEvent,
): Promise<void> {
  if (event.type === "account_update") {
    const userId = event.userId;
    if (!userId) return;
    await persistLiveFiguresAndPositions(supabase, {
      userId,
      accountId: event.accountId,
      figures: {
        balance: event.balance,
        equity: event.equity,
        margin: event.margin,
        freeMargin: event.freeMargin,
        marginLevel: event.marginLevel,
        currency: event.currency,
        profit: event.profit,
      },
      positions: event.positions,
    });
    return;
  }
  // Per-symbol `positions_update` is a slice. Replacing the table from it
  // would wipe every other ticket. Full snapshots arrive on `account_update`.
}
