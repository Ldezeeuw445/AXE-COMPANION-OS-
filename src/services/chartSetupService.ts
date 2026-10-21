import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sanitisePrefs,
  summariseChartSetup,
  type ChartPrefRow,
  type ChartSetupSummary,
} from "@/lib/chart/chartPrefs";

/**
 * How this trader actually reads a chart, for AXE to use.
 *
 * This is the thing that was missing. `learningArcService` used to put
 * "Key indicators they use: RSI, MACD, MA" into the morning-brief prompt,
 * under the heading "Key facts", for every trader alike — three names that
 * were a constant in the source. I took it out rather than keep handing the
 * model a fabrication, which left AXE knowing nothing at all about how
 * someone looks at a chart.
 *
 * Now the toggles live in `user_chart_preferences`, so there is a real answer:
 * the indicators and SMC overlays the trader has switched on, counted across
 * their own saved charts. Still empty for someone who has never changed a
 * default, and the caller has to say so instead of reaching for three
 * plausible names.
 */

const EMPTY: ChartSetupSummary = { indicators: [], smcTools: [], scopes: 0, symbols: [] };

export async function getChartSetup(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChartSetupSummary> {
  try {
    const { data, error } = await supabase
      .from("user_chart_preferences")
      .select("account_key, symbol_key, prefs, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[chartSetup] read failed:", error.message);
      return EMPTY;
    }

    const rows: ChartPrefRow[] = (data ?? []).map((row) => {
      const accountKey = String(row.account_key);
      const symbolKey = String(row.symbol_key);
      return {
        accountKey,
        symbolKey,
        // Same allowlist as the write path: a key that is no longer synced
        // should stop being read too, not linger in what AXE is told.
        prefs: sanitisePrefs(row.prefs, { accountKey, symbolKey }),
        updatedAt: String(row.updated_at),
      };
    });

    return summariseChartSetup(rows);
  } catch (err) {
    console.error("[chartSetup] unexpected failure:", err);
    return EMPTY;
  }
}
