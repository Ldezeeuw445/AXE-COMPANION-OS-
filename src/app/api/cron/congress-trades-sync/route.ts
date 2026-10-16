import type { NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import {
  dedupe,
  mapCongressTrades,
  type AlphaVantageCongressTrade,
} from "@/lib/intel/congressTrades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fill `intel_congress_trades` from Alpha Vantage.
 *
 * That table has had nothing writing to it since Unusual Whales came out, so
 * the intel page has been saying "No congressional feed yet." to everyone.
 * Alpha Vantage serves the same STOCK Act disclosures for free, House and
 * Senate both.
 *
 * Secured with CRON_SECRET. Daily is plenty: these are filings, not ticks —
 * the law gives members 45 days to report. See docs/CRON-RUNBOOK.md.
 *
 * Needs ALPHAVANTAGE_API_KEY on the host. Without it this returns 503 and
 * says so, rather than returning 200 over an empty table — a feed that is
 * quietly empty is the failure mode this whole audit was about.
 */

/** The API wants a filter. These are the names the feed is read for. */
const WATCHED = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "SPY"];

/** Free Alpha Vantage keys are rate-limited; stay well inside it. */
const DELAY_MS = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request.headers)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = (process.env.ALPHAVANTAGE_API_KEY ?? "").trim();
  if (!apiKey) {
    return Response.json(
      {
        error: "alphavantage_key_missing",
        detail:
          "Set ALPHAVANTAGE_API_KEY on the host. Until then the congressional feed stays empty — this is not configured, which is a different thing from broken.",
        needsOperator: true,
      },
      { status: 503 },
    );
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  const startedAt = Date.now();
  const perSymbol: Array<{ symbol: string; fetched: number; mapped: number; error?: string }> = [];
  let allRows: ReturnType<typeof mapCongressTrades>["rows"] = [];
  const skippedTotal = { noDirection: 0, noTicker: 0, noDate: 0, noPolitician: 0 };

  for (const symbol of WATCHED) {
    try {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "CONGRESS_TRADES");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", apiKey);

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        perSymbol.push({ symbol, fetched: 0, mapped: 0, error: `http_${res.status}` });
        continue;
      }
      const json = (await res.json()) as {
        trades?: AlphaVantageCongressTrade[];
        Note?: string;
        Information?: string;
      };

      // Alpha Vantage answers 200 with a prose "Note" when you hit the rate
      // limit. Treating that as an empty day would wipe nothing but would
      // report success on a call that never ran.
      const throttled = json.Note ?? json.Information;
      if (throttled) {
        perSymbol.push({ symbol, fetched: 0, mapped: 0, error: "rate_limited" });
        break;
      }

      const trades = Array.isArray(json.trades) ? json.trades : [];
      const { rows, skipped } = mapCongressTrades(trades);
      skippedTotal.noDirection += skipped.noDirection;
      skippedTotal.noTicker += skipped.noTicker;
      skippedTotal.noDate += skipped.noDate;
      skippedTotal.noPolitician += skipped.noPolitician;
      allRows = allRows.concat(rows);
      perSymbol.push({ symbol, fetched: trades.length, mapped: rows.length });
    } catch (err) {
      perSymbol.push({
        symbol,
        fetched: 0,
        mapped: 0,
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
    await sleep(DELAY_MS);
  }

  const rows = dedupe(allRows);
  let upserted = 0;
  let upsertError: string | null = null;

  if (rows.length > 0) {
    // Matches the unique index, so a re-run is a no-op instead of a duplicate.
    const { error } = await supabase
      .from("intel_congress_trades")
      .upsert(rows, { onConflict: "politician,ticker,trade_date,trade_type,amount_range" });
    if (error) upsertError = error.message;
    else upserted = rows.length;
  }

  const ok = upsertError === null && perSymbol.some((s) => s.mapped > 0);

  return Response.json(
    {
      ok,
      upserted,
      candidates: rows.length,
      skipped: skippedTotal,
      perSymbol,
      error: upsertError,
      ms: Date.now() - startedAt,
    },
    { status: ok ? 200 : 502 },
  );
}
