import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEMO_WATCHLIST_SYMBOLS } from "@/lib/broker/demoAccount";
import { SQUAWK_STATION_IDS } from "@/lib/squawk/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_THEMES = new Set(["midnight", "charcoal", "slate", "paper"]);
const VALID_TIMEFRAMES = new Set(["m15", "m30", "h1", "h4", "d1"]);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ completed: true, reason: "no_supabase" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ completed: true, reason: "anonymous" });
  }

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select(
      "onboarding_completed_at,chart_theme,default_chart_timeframe,default_risk_percent,max_account_risk_percent,squawk_station_ids",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({
    completed: Boolean(data?.onboarding_completed_at),
    completedAt: data?.onboarding_completed_at ?? null,
    prefs: {
      chartTheme: data?.chart_theme ?? "midnight",
      timeframe: data?.default_chart_timeframe ?? "h1",
      defaultRiskPercent: Number(data?.default_risk_percent ?? 1),
      maxAccountRiskPercent: Number(data?.max_account_risk_percent ?? 5),
      squawkStationIds: (data?.squawk_station_ids as string[] | null) ?? SQUAWK_STATION_IDS,
    },
    suggestedSymbols: [...DEMO_WATCHLIST_SYMBOLS],
  });
}

type OnboardingBody = {
  symbols?: string[];
  chartTheme?: string;
  timeframe?: string;
  squawkStationIds?: string[];
  defaultRiskPercent?: number;
  maxAccountRiskPercent?: number;
};

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const chartTheme = body.chartTheme && VALID_THEMES.has(body.chartTheme) ? body.chartTheme : "midnight";
  const timeframe =
    body.timeframe && VALID_TIMEFRAMES.has(body.timeframe) ? body.timeframe : "h1";
  const defaultRiskPercent = Math.min(5, Math.max(0.25, Number(body.defaultRiskPercent ?? 1)));
  const maxAccountRiskPercent = Math.min(
    20,
    Math.max(defaultRiskPercent, Number(body.maxAccountRiskPercent ?? 5)),
  );
  const squawkStationIds =
    Array.isArray(body.squawkStationIds) && body.squawkStationIds.length > 0
      ? body.squawkStationIds.filter((id) => typeof id === "string")
      : [...SQUAWK_STATION_IDS];

  const symbols = (body.symbols ?? [...DEMO_WATCHLIST_SYMBOLS.slice(0, 4)])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);

  for (const symbol of symbols) {
    await supabase.from("assistant_memory_entries").upsert(
      {
        user_id: user.id,
        scope: "watchlist",
        entry_key: symbol,
        content: symbol,
      },
      { onConflict: "user_id,scope,entry_key" },
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      chart_theme: chartTheme,
      default_chart_timeframe: timeframe,
      default_risk_percent: defaultRiskPercent,
      max_account_risk_percent: maxAccountRiskPercent,
      squawk_station_ids: squawkStationIds,
      onboarding_completed_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    completedAt: now,
    symbols,
    chartTheme,
    timeframe,
    defaultRiskPercent,
    maxAccountRiskPercent,
  });
}
