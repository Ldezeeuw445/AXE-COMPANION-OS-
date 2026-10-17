import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPushCategory, PUSH_CATEGORIES, type PushCategory } from "@/lib/push/categories";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import { buildTestPushEvents } from "@/lib/push/testEvents";

export type PushTestSuiteResult = {
  ok: true;
  sent: number;
  total: number;
  types: readonly PushCategory[];
  results: Array<{
    category: PushCategory;
    url: string;
    sent: number;
    total: number;
    expired: number;
    skipped: string | null;
  }>;
};

export async function runPushTestSuite(
  userId: string,
  supabase: SupabaseClient,
  types?: unknown,
): Promise<PushTestSuiteResult> {
  const requested = Array.isArray(types) ? types.filter(isPushCategory) : [];
  const suite = buildTestPushEvents();
  const selected = requested.length > 0
    ? suite.filter((event) => requested.includes(event.category))
    : suite;

  const results = [];
  for (const event of selected) {
    const delivered = await dispatchPushEvent({
      userId,
      category: event.category,
      eventKey: event.eventKey,
      title: event.title,
      body: event.body,
      symbol: event.symbol,
      timeframe: event.timeframe,
      threadId: event.threadId,
      bypassPrefs: true,
      bypassDedup: true,
      supabase,
    });
    results.push({
      category: event.category,
      url: event.payload.url,
      sent: delivered.sent,
      total: delivered.total,
      expired: delivered.expired,
      skipped: delivered.skipped ?? null,
    });
  }

  return {
    ok: true,
    sent: results.reduce((sum, row) => sum + row.sent, 0),
    total: results.reduce((sum, row) => sum + row.total, 0),
    types: PUSH_CATEGORIES,
    results,
  };
}
