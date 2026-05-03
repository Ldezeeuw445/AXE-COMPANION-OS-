// Maps common trading symbols to Yahoo Finance tickers
const SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "GC=F",
  GOLD: "GC=F",
  XAGUSD: "SI=F",
  SILVER: "SI=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X",
  AUDUSD: "AUDUSD=X",
  NZDUSD: "NZDUSD=X",
  USDCAD: "USDCAD=X",
  EURGBP: "EURGBP=X",
  EURJPY: "EURJPY=X",
  GBPJPY: "GBPJPY=X",
  DXY: "DX-Y.NYB",
  ES: "ES=F",
  NQ: "NQ=F",
  YM: "YM=F",
  RTY: "RTY=F",
  CL: "CL=F",
  GC: "GC=F",
  SI: "SI=F",
  NG: "NG=F",
  BTC: "BTC-USD",
  ETH: "ETH-USD",
};

export type LivePriceResult = {
  symbol: string;
  price: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  changePercent: number;
  currency: string;
};

export async function fetchLivePrice(
  symbol: string
): Promise<LivePriceResult | { error: string }> {
  const upper = symbol.toUpperCase().replace("/", "");
  const ticker = SYMBOL_MAP[upper] ?? `${upper}=X`;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        // Revalidate every 30s — prices are near-real-time
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) {
      return { error: `No data for ${symbol} (HTTP ${res.status})` };
    }

    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            regularMarketPreviousClose?: number;
            regularMarketChangePercent?: number;
            currency?: string;
          };
        }[];
        error?: { description?: string };
      };
    };

    if (data?.chart?.error) {
      return { error: data.chart.error.description ?? `Unknown error for ${symbol}` };
    }

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice === undefined) {
      return { error: `No price data returned for ${symbol}` };
    }

    return {
      symbol: upper,
      price: meta.regularMarketPrice,
      dayHigh: meta.regularMarketDayHigh ?? meta.regularMarketPrice,
      dayLow: meta.regularMarketDayLow ?? meta.regularMarketPrice,
      previousClose: meta.regularMarketPreviousClose ?? meta.regularMarketPrice,
      changePercent: meta.regularMarketChangePercent ?? 0,
      currency: meta.currency ?? "USD",
    };
  } catch (err) {
    return { error: `Failed to fetch ${symbol}: ${String(err)}` };
  }
}

export function formatLivePrice(result: LivePriceResult): string {
  const sign = result.changePercent >= 0 ? "+" : "";
  const dp = result.price < 10 ? 5 : result.price < 100 ? 4 : 2;
  const fmt = (n: number) => n.toFixed(dp);

  return (
    `${result.symbol} — Live Price Data\n` +
    `Price: ${fmt(result.price)} ${result.currency}\n` +
    `Day High: ${fmt(result.dayHigh)}  |  Day Low: ${fmt(result.dayLow)}\n` +
    `Range: ${(result.dayHigh - result.dayLow).toFixed(dp)} pts\n` +
    `Prev Close: ${fmt(result.previousClose)}\n` +
    `Change: ${sign}${result.changePercent.toFixed(2)}%`
  );
}

// ─── Economic Calendar (Forex Factory free feed) ────────────────────────────

type FFEvent = {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
};

export type CalendarEvent = {
  title: string;
  currency: string;
  date: string;
  time: string;
  impact: "High" | "Medium" | "Low" | "Holiday" | "Unknown";
  forecast: string;
  previous: string;
};

const IMPACT_ORDER = { High: 0, Medium: 1, Low: 2, Holiday: 3, Unknown: 4 };

function normalizeImpact(raw: string): CalendarEvent["impact"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  if (s === "low") return "Low";
  if (s === "holiday") return "Holiday";
  return "Unknown";
}

export async function fetchEconomicCalendar(
  currency?: string,
  impact?: "High" | "Medium" | "Low"
): Promise<CalendarEvent[] | { error: string }> {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!res.ok) {
      return { error: `Economic calendar unavailable (HTTP ${res.status})` };
    }

    const raw = (await res.json()) as FFEvent[];

    let events: CalendarEvent[] = raw.map((e) => ({
      title: e.title,
      currency: (e.country ?? "").toUpperCase(),
      date: e.date,
      time: e.time,
      impact: normalizeImpact(e.impact),
      forecast: e.forecast ?? "",
      previous: e.previous ?? "",
    }));

    // Filter by currency if provided
    if (currency) {
      const cu = currency.toUpperCase();
      events = events.filter((e) => e.currency === cu);
    }

    // Filter by minimum impact level if provided
    if (impact) {
      const minOrder = IMPACT_ORDER[impact] ?? 4;
      events = events.filter((e) => (IMPACT_ORDER[e.impact] ?? 4) <= minOrder);
    }

    // Sort: High first, then by date/time
    events.sort((a, b) => {
      const impactDiff = (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4);
      if (impactDiff !== 0) return impactDiff;
      return new Date(a.date + " " + a.time).getTime() - new Date(b.date + " " + b.time).getTime();
    });

    return events;
  } catch (err) {
    return { error: `Failed to fetch calendar: ${String(err)}` };
  }
}

export function formatEconomicCalendar(events: CalendarEvent[]): string {
  if (events.length === 0) return "No events found for the current filter.";

  const BIG3 = ["Non-Farm", "FOMC", "Federal Funds", "Consumer Price Index", "CPI"];

  const lines = events.map((e) => {
    const isBig3 = BIG3.some((kw) => e.title.includes(kw));
    const tag = isBig3 ? " ⚡BIG3" : "";
    const fc = e.forecast ? ` | F: ${e.forecast}` : "";
    const prev = e.previous ? ` | P: ${e.previous}` : "";
    return `[${e.impact.toUpperCase()}] ${e.currency} — ${e.title}${tag}  ${e.date} ${e.time}${fc}${prev}`;
  });

  return `ECONOMIC CALENDAR — THIS WEEK\n${lines.join("\n")}`;
}
