import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluatePriceAlertsForUser } from "./priceAlertCronEvaluator.ts";
import { quotesFromSnapshots, type PriceAlertRow } from "./tosPriceAlert.ts";

type AlertStore = PriceAlertRow & { user_id: string };

function row(partial: Partial<AlertStore> = {}): AlertStore {
  return {
    id: "a1",
    user_id: "u1",
    symbol: "GOLD",
    type: "price",
    condition: "above",
    threshold: 2700,
    status: "active",
    triggered_at: null,
    account_id: null,
    metadata: { source_app: "trading-os" },
    ...partial,
  };
}

function fakeSupabase(alerts: AlertStore[], snapshots: Array<Record<string, unknown>> = []) {
  return {
    from(table: string) {
      if (table === "chart_live_snapshots") {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          then: (resolve: (v: unknown) => void) => resolve({ data: snapshots, error: null }),
        };
        return q;
      }
      if (table !== "user_alerts") {
        throw new Error(`unexpected table ${table}`);
      }
      const filters: Array<(r: AlertStore) => boolean> = [];
      let patch: Partial<AlertStore> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Partial<AlertStore>) => {
          patch = p;
          return q;
        },
        eq: (col: keyof AlertStore, v: string) => {
          filters.push((r) => String(r[col] ?? "") === v);
          return q;
        },
        or: (expr: string) => {
          const cutoff = expr.split('triggered_at.lt."')[1]?.replace(/"$/, "") ?? "";
          filters.push((r) => r.triggered_at == null || r.triggered_at < cutoff);
          return q;
        },
        then: (resolve: (v: unknown) => void) => {
          const hit = alerts.filter((r) => filters.every((f) => f(r)));
          if (patch) {
            hit.forEach((r) => Object.assign(r, patch));
            resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            return;
          }
          resolve({ data: hit, error: null });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("quotesFromSnapshots", () => {
  it("keys quotes by Companion display symbol, preferring the quote timeframe", () => {
    const quotes = quotesFromSnapshots([
      { display_symbol: "XAUUSD", last_price: 2690, timeframe: "h1" },
      { display_symbol: "XAUUSD", last_price: 2701, timeframe: "quote" },
      { display_symbol: "EURUSD", last_bid: 1.08, last_ask: 1.082, timeframe: "quote" },
    ]);
    assert.equal(quotes.XAUUSD, 2701);
    assert.equal(quotes.EURUSD, 1.081);
  });
});

describe("evaluatePriceAlertsForUser", () => {
  const nowIso = "2026-11-18T12:00:00.000Z";

  it("baselines the first GOLD sample against an XAUUSD snapshot and does not push", async () => {
    const alerts = [row()];
    const pushes: unknown[] = [];
    const feeds: unknown[] = [];
    const result = await evaluatePriceAlertsForUser(fakeSupabase(alerts), "u1", {
      hasPush: true,
      nowIso,
      quotes: { XAUUSD: 2690 },
      firePush: async (input) => {
        pushes.push(input);
        return true;
      },
      recordFeed: async () => {
        feeds.push("feed");
        return true;
      },
    });
    assert.equal(result.baselined, 1);
    assert.equal(result.triggered, 0);
    assert.equal(pushes.length, 0);
    assert.equal(feeds.length, 0);
    assert.equal((alerts[0].metadata as Record<string, unknown>).last_eval_price, 2690);
    assert.equal(alerts[0].triggered_at, null);
  });

  it("fires on a real cross, claims the row, writes feed, and pushes — no auto-trade table writes", async () => {
    const alerts = [row({ metadata: { source_app: "trading-os", last_eval_price: 2690 } })];
    const tables = new Set<string>();
    const client = fakeSupabase(alerts);
    const originalFrom = client.from.bind(client);
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      tables.add(table);
      return originalFrom(table);
    };

    const pushes: Array<{ eventKey: string; body: string }> = [];
    const result = await evaluatePriceAlertsForUser(client, "u1", {
      hasPush: true,
      nowIso,
      quotes: { XAUUSD: 2705 },
      firePush: async (input) => {
        pushes.push({ eventKey: input.eventKey, body: input.body });
        return true;
      },
      recordFeed: async (_sb, _userId, eventKey) => {
        assert.match(eventKey, /^alert:a1:/);
        return true;
      },
    });

    assert.equal(result.triggered, 1);
    assert.equal(result.pushed, 1);
    assert.equal(alerts[0].triggered_at, nowIso);
    assert.equal(pushes[0]?.eventKey, `price_alert:a1:${nowIso}`);
    assert.match(pushes[0]?.body ?? "", /XAUUSD above 2700/);
    assert.deepEqual([...tables], ["user_alerts"]);
  });

  it("skips a TOS alert when there is no snapshot for that symbol", async () => {
    const result = await evaluatePriceAlertsForUser(fakeSupabase([row()]), "u1", {
      hasPush: true,
      nowIso,
      quotes: { EURUSD: 1.08 },
      firePush: async () => true,
      recordFeed: async () => true,
    });
    assert.deepEqual(result, { triggered: 0, pushed: 0, baselined: 0 });
  });

  it("does not treat a Companion smart template without a level as a price alert", async () => {
    const result = await evaluatePriceAlertsForUser(
      fakeSupabase([
        row({
          threshold: null,
          metadata: { evaluator: "smart", smartKind: "predictive" },
        }),
      ]),
      "u1",
      { quotes: { XAUUSD: 2705 }, nowIso },
    );
    assert.deepEqual(result, { triggered: 0, pushed: 0, baselined: 0 });
  });
});
